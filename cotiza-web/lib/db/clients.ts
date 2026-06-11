import "server-only";

import { prisma } from "@/lib/db/prisma";

export type ClientSummary = {
  active: boolean;
  address: string | null;
  clientId: string;
  clientLogoId: string | null;
  company: string;
  contactEmail: string | null;
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
  contactName?: string | null;
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

  const row = await prisma.client.create({
    data: {
      address: input.address?.trim() || null,
      client_logo_id: clientLogoId,
      company: input.company.trim(),
      contact_email: input.contactEmail?.trim() || null,
      contact_name: input.contactName?.trim() || null,
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
    select: { client_id: true },
    where: { client_id: clientId, tenant_id: tenantId },
  });

  if (!existing) {
    return null;
  }

  const clientLogoId =
    input.clientLogoId !== undefined
      ? await resolveClientLogoIdForTenant(tenantId, input.clientLogoId)
      : undefined;

  const row = await prisma.client.update({
    data: {
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.address !== undefined ? { address: input.address?.trim() || null } : {}),
      ...(input.clientLogoId !== undefined ? { client_logo_id: clientLogoId ?? null } : {}),
      ...(input.company !== undefined ? { company: input.company.trim() } : {}),
      ...(input.contactEmail !== undefined ? { contact_email: input.contactEmail?.trim() || null } : {}),
      ...(input.contactName !== undefined ? { contact_name: input.contactName?.trim() || null } : {}),
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
