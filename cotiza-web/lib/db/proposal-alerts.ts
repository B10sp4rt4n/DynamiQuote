import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export type ExpiringProposalAlert = {
  proposalId: string;
  proposalNumber: string;
  recipientCompany: string;
  validUntil: string;
};

// Propuestas cuya vigencia (formal_proposals.valid_until, la version mas
// reciente por proposal_id) cae entre hoy y hoy + diasAnticipacion, en el
// scope "ve lo tuyo vs. ve todo" ya usado en KPIs. Excluye propuestas ya
// resueltas (aprobada/rechazada) -- su vigencia ya no es accionable.
export async function getExpiringProposalsByTenant(
  tenantId: string,
  daysAhead: number,
  viewerUserId: string | null = null,
  canSeeAll = true,
): Promise<ExpiringProposalAlert[]> {
  const scopeFilter = canSeeAll
    ? Prisma.empty
    : Prisma.sql`AND (p.created_by_user_id = ${viewerUserId} OR p.created_by_user_id IS NULL)`;

  const rows = await prisma.$queryRaw<
    Array<{
      proposal_id: string;
      proposal_number: string;
      recipient_company: string;
      valid_until: Date;
    }>
  >(Prisma.sql`
    SELECT DISTINCT ON (fp.proposal_id)
      fp.proposal_id,
      fp.proposal_number,
      fp.recipient_company,
      fp.valid_until
    FROM formal_proposals fp
    JOIN proposals p ON p.proposal_id = fp.proposal_id
    WHERE p.tenant_id = ${tenantId}
      AND fp.valid_until IS NOT NULL
      AND fp.valid_until >= CURRENT_DATE
      AND fp.valid_until <= CURRENT_DATE + (${daysAhead}::int * INTERVAL '1 day')
      AND p.status NOT IN ('approved', 'rejected')
      ${scopeFilter}
    ORDER BY fp.proposal_id, fp.created_at DESC
  `);

  return rows
    .map((row) => ({
      proposalId: row.proposal_id,
      proposalNumber: row.proposal_number,
      recipientCompany: row.recipient_company,
      validUntil: row.valid_until.toISOString(),
    }))
    .sort((a, b) => a.validUntil.localeCompare(b.validUntil));
}

export type UnlabeledProposalAlert = {
  proposalId: string;
  proposalNumber: string;
  recipientCompany: string;
  validUntil: string;
};

// Propuestas "Enviada" cuya vigencia ya venció y que nunca se etiquetaron
// (outcome NULL) -- sin esto, la "tasa de cierre real" se va llenando de
// propuestas fantasma que nadie marco como ganada/perdida/descartada.
export async function getUnlabeledExpiredProposalsByTenant(
  tenantId: string,
  viewerUserId: string | null = null,
  canSeeAll = true,
): Promise<UnlabeledProposalAlert[]> {
  const scopeFilter = canSeeAll
    ? Prisma.empty
    : Prisma.sql`AND (p.created_by_user_id = ${viewerUserId} OR p.created_by_user_id IS NULL)`;

  const rows = await prisma.$queryRaw<
    Array<{
      proposal_id: string;
      proposal_number: string;
      recipient_company: string;
      valid_until: Date;
    }>
  >(Prisma.sql`
    SELECT DISTINCT ON (fp.proposal_id)
      fp.proposal_id,
      fp.proposal_number,
      fp.recipient_company,
      fp.valid_until
    FROM formal_proposals fp
    JOIN proposals p ON p.proposal_id = fp.proposal_id
    WHERE p.tenant_id = ${tenantId}
      AND p.status = 'sent'
      AND p.outcome IS NULL
      AND fp.valid_until IS NOT NULL
      AND fp.valid_until < CURRENT_DATE
      ${scopeFilter}
    ORDER BY fp.proposal_id, fp.created_at DESC
  `);

  return rows
    .map((row) => ({
      proposalId: row.proposal_id,
      proposalNumber: row.proposal_number,
      recipientCompany: row.recipient_company,
      validUntil: row.valid_until.toISOString(),
    }))
    .sort((a, b) => a.validUntil.localeCompare(b.validUntil));
}
