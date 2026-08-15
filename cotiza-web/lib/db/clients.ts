import "server-only";

import { prisma } from "@/lib/db/prisma";

export type ClientSummary = {
  active: boolean;
  address: string | null;
  clientId: string;
  clientLogoId: string | null;
  company: string;
  contactEmail: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactTitle: string | null;
  createdAt: string;
  industry: string | null;
  notes: string | null;
  rfc: string | null;
  tenantId: string;
  updatedAt: string | null;
};

export type CreateClientInput = {
  address?: string | null;
  clientLogoId?: string | null;
  company: string;
  contactEmail?: string | null;
  contactFirstName?: string | null;
  contactLastName?: string | null;
  contactPhone?: string | null;
  contactTitle?: string | null;
  industry?: string | null;
  notes?: string | null;
  rfc?: string | null;
};

export type UpdateClientInput = Partial<CreateClientInput> & {
  active?: boolean;
};

function mapToSummary(row: {
  active: boolean;
  address: string | null;
  client_id: string;
  client_logo_id: string | null;
  company: string;
  contact_email: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_title: string | null;
  created_at: Date;
  industry: string | null;
  notes: string | null;
  rfc: string | null;
  tenant_id: string;
  updated_at: Date | null;
}): ClientSummary {
  return {
    active: row.active,
    address: row.address,
    clientId: row.client_id,
    clientLogoId: row.client_logo_id,
    company: row.company,
    contactEmail: row.contact_email,
    contactFirstName: row.contact_first_name,
    contactLastName: row.contact_last_name,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    contactTitle: row.contact_title,
    createdAt: row.created_at.toISOString(),
    industry: row.industry,
    notes: row.notes,
    rfc: row.rfc,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
  };
}

async function resolveClientLogoIdForTenant(tenantId: string, logoId?: string | null): Promise<string | null> {
  const normalized = logoId?.trim() ?? "";

  if (!normalized) {
    return null;
  }

  const logo = await prisma.company_logos.findFirst({
    select: { logo_id: true },
    where: {
      logo_id: normalized,
      logo_type: "client",
      tenant_id: tenantId,
    },
  });

  return logo?.logo_id ?? null;
}

// Lista todos los clientes activos del tenant. Acepta búsqueda opcional por empresa, contacto o email.
export async function listClientsByTenant(
  tenantId: string,
  search?: string,
): Promise<ClientSummary[]> {
  const normalizedSearch = search?.trim().toLowerCase();

  const rows = await prisma.client.findMany({
    orderBy: [{ company: "asc" }],
    where: {
      active: true,
      tenant_id: tenantId,
      ...(normalizedSearch
        ? {
            OR: [
              { company: { contains: normalizedSearch, mode: "insensitive" } },
              { contact_name: { contains: normalizedSearch, mode: "insensitive" } },
              { contact_email: { contains: normalizedSearch, mode: "insensitive" } },
            ],
          }
        : {}),
    },
  });

  return rows.map(mapToSummary);
}

// Obtiene un cliente por ID validando que pertenezca al tenant (aislamiento).
export async function getClientByIdForTenant(
  clientId: string,
  tenantId: string,
): Promise<ClientSummary | null> {
  const row = await prisma.client.findFirst({
    where: { client_id: clientId, tenant_id: tenantId },
  });

  return row ? mapToSummary(row) : null;
}

// Crea un cliente para el tenant. company es obligatorio.
export async function createClientForTenant(
  tenantId: string,
  input: CreateClientInput,
): Promise<ClientSummary> {
  const clientLogoId = await resolveClientLogoIdForTenant(tenantId, input.clientLogoId);
  const contactFirstName = input.contactFirstName?.trim() || null;
  const contactLastName = input.contactLastName?.trim() || null;
  const contactName = [contactFirstName, contactLastName].filter(Boolean).join(" ") || null;

  const row = await prisma.client.create({
    data: {
      address: input.address?.trim() || null,
      client_logo_id: clientLogoId,
      company: input.company.trim(),
      contact_email: input.contactEmail?.trim() || null,
      contact_first_name: contactFirstName,
      contact_last_name: contactLastName,
      contact_name: contactName,
      contact_phone: input.contactPhone?.trim() || null,
      contact_title: input.contactTitle?.trim() || null,
      industry: input.industry?.trim() || null,
      notes: input.notes?.trim() || null,
      rfc: input.rfc?.trim() || null,
      tenant_id: tenantId,
    },
  });

  return mapToSummary(row);
}

// Actualiza un cliente del tenant. No permite modificar tenant_id.
export async function updateClientForTenant(
  clientId: string,
  tenantId: string,
  input: UpdateClientInput,
): Promise<ClientSummary | null> {
  // Verificar que el cliente pertenece al tenant antes de actualizar
  const existing = await prisma.client.findFirst({
    select: { client_id: true, contact_first_name: true, contact_last_name: true },
    where: { client_id: clientId, tenant_id: tenantId },
  });

  if (!existing) {
    return null;
  }

  const clientLogoId =
    input.clientLogoId !== undefined
      ? await resolveClientLogoIdForTenant(tenantId, input.clientLogoId)
      : undefined;

  // contact_name (combinado) se recalcula solo cuando el nombre o apellido
  // cambian, para no borrar el valor legado de clientes que aun no tienen
  // contact_first_name/contact_last_name poblados.
  const nextContactFirstName =
    input.contactFirstName !== undefined ? input.contactFirstName?.trim() || null : existing.contact_first_name;
  const nextContactLastName =
    input.contactLastName !== undefined ? input.contactLastName?.trim() || null : existing.contact_last_name;
  const shouldRecomputeContactName = input.contactFirstName !== undefined || input.contactLastName !== undefined;
  const nextContactName = shouldRecomputeContactName
    ? [nextContactFirstName, nextContactLastName].filter(Boolean).join(" ") || null
    : undefined;

  const row = await prisma.client.update({
    data: {
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.address !== undefined ? { address: input.address?.trim() || null } : {}),
      ...(input.clientLogoId !== undefined ? { client_logo_id: clientLogoId ?? null } : {}),
      ...(input.company !== undefined ? { company: input.company.trim() } : {}),
      ...(input.contactEmail !== undefined ? { contact_email: input.contactEmail?.trim() || null } : {}),
      ...(input.contactFirstName !== undefined ? { contact_first_name: nextContactFirstName } : {}),
      ...(input.contactLastName !== undefined ? { contact_last_name: nextContactLastName } : {}),
      ...(nextContactName !== undefined ? { contact_name: nextContactName } : {}),
      ...(input.contactPhone !== undefined ? { contact_phone: input.contactPhone?.trim() || null } : {}),
      ...(input.contactTitle !== undefined ? { contact_title: input.contactTitle?.trim() || null } : {}),
      ...(input.industry !== undefined ? { industry: input.industry?.trim() || null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
      ...(input.rfc !== undefined ? { rfc: input.rfc?.trim() || null } : {}),
    },
    where: { client_id: clientId },
  });

  return mapToSummary(row);
}
