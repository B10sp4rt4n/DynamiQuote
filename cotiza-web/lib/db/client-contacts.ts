import "server-only";

import { randomUUID } from "crypto";

import { prisma } from "@/lib/db/prisma";

export type ClientContact = {
  contactId: string;
  email: string | null;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  title: string | null;
};

export type CreateClientContactInput = {
  email?: string | null;
  firstName: string;
  lastName?: string | null;
  phone?: string | null;
  title?: string | null;
};

// Directorio adicional de personas por cliente -- separado del contacto
// unico que ya existe en Client (ese no se toca, sigue siendo el que
// aparece en documentos y propuestas).
export async function listClientContactsForTenant(tenantId: string, clientId: string): Promise<ClientContact[]> {
  const rows = await prisma.client_contacts.findMany({
    orderBy: { created_at: "asc" },
    where: { client_id: clientId, tenant_id: tenantId },
  });

  return rows.map((row) => ({
    contactId: row.contact_id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    title: row.title,
  }));
}

export async function createClientContactForTenant(
  tenantId: string,
  clientId: string,
  input: CreateClientContactInput,
): Promise<ClientContact> {
  const contactId = randomUUID();

  const row = await prisma.client_contacts.create({
    data: {
      client_id: clientId,
      contact_id: contactId,
      created_at: new Date(),
      email: input.email?.trim() || null,
      first_name: input.firstName.trim(),
      last_name: input.lastName?.trim() || null,
      phone: input.phone?.trim() || null,
      tenant_id: tenantId,
      title: input.title?.trim() || null,
    },
  });

  return {
    contactId: row.contact_id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    title: row.title,
  };
}

export async function deleteClientContactForTenant(
  tenantId: string,
  contactId: string,
): Promise<"deleted" | "not_found"> {
  const result = await prisma.client_contacts.deleteMany({
    where: { contact_id: contactId, tenant_id: tenantId },
  });

  return result.count > 0 ? "deleted" : "not_found";
}
