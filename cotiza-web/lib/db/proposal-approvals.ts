import { randomUUID } from "crypto";

import { evaluateApprovalGate, type ProposalApprovalGate } from "@/lib/domain/proposal-approval-gate";
import { prisma } from "@/lib/db/prisma";

export type ProposalApprovalDecision = "approved" | "rejected";
export type ProposalApproverRole = "superadmin" | "owner" | "admin" | "user";

export type ProposalApprovalRecord = {
  approvalId: string;
  approverRole: ProposalApproverRole;
  approverUserId: string;
  createdAt: string;
  decision: ProposalApprovalDecision;
  proposalId: string;
  reason: string | null;
  tenantId: string;
};

let proposalApprovalsTableReady = false;

async function ensureProposalApprovalsTable(): Promise<void> {
  if (proposalApprovalsTableReady) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS proposal_approvals (
      approval_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      proposal_id TEXT NOT NULL,
      approver_user_id TEXT NOT NULL,
      approver_role TEXT NOT NULL,
      decision TEXT NOT NULL,
      reason TEXT,
      created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
      CONSTRAINT proposal_approvals_proposal_fk
        FOREIGN KEY (proposal_id) REFERENCES proposals(proposal_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT proposal_approvals_decision_check
        CHECK (decision IN ('approved', 'rejected'))
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_proposal_approvals_tenant_proposal
    ON proposal_approvals (tenant_id, proposal_id, created_at DESC)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_proposal_approvals_role
    ON proposal_approvals (tenant_id, proposal_id, approver_role, decision)
  `);

  proposalApprovalsTableReady = true;
}

type ProposalApprovalRow = {
  approval_id: string;
  approver_role: string;
  approver_user_id: string;
  created_at: Date | string;
  decision: string;
  proposal_id: string;
  reason: string | null;
  tenant_id: string;
};

function normalizeApproverRole(value: string): ProposalApproverRole {
  const role = value.trim().toLowerCase();
  if (role === "superadmin" || role === "owner" || role === "admin") {
    return role;
  }

  return "user";
}

function normalizeDecision(value: string): ProposalApprovalDecision {
  return value.trim().toLowerCase() === "rejected" ? "rejected" : "approved";
}

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function mapApprovalRow(row: ProposalApprovalRow): ProposalApprovalRecord {
  return {
    approvalId: row.approval_id,
    approverRole: normalizeApproverRole(row.approver_role),
    approverUserId: row.approver_user_id,
    createdAt: toIso(row.created_at),
    decision: normalizeDecision(row.decision),
    proposalId: row.proposal_id,
    reason: row.reason,
    tenantId: row.tenant_id,
  };
}

export async function registerProposalApprovalDecisionByTenant(input: {
  approverRole: ProposalApproverRole;
  approverUserId: string;
  decision: ProposalApprovalDecision;
  proposalId: string;
  reason?: string | null;
  tenantId: string;
}): Promise<void> {
  await ensureProposalApprovalsTable();

  await prisma.$executeRaw`
    INSERT INTO proposal_approvals (
      approval_id,
      tenant_id,
      proposal_id,
      approver_user_id,
      approver_role,
      decision,
      reason,
      created_at
    )
    VALUES (
      ${randomUUID()},
      ${input.tenantId},
      ${input.proposalId},
      ${input.approverUserId},
      ${input.approverRole},
      ${input.decision},
      ${input.reason ?? null},
      NOW()
    )
  `;
}

export async function getProposalApprovalsByTenant(
  tenantId: string,
  proposalId: string,
): Promise<ProposalApprovalRecord[]> {
  await ensureProposalApprovalsTable();

  const rows = await prisma.$queryRaw<ProposalApprovalRow[]>`
    SELECT
      approval_id,
      tenant_id,
      proposal_id,
      approver_user_id,
      approver_role,
      decision,
      reason,
      created_at
    FROM proposal_approvals
    WHERE tenant_id = ${tenantId}
      AND proposal_id = ${proposalId}
    ORDER BY created_at DESC, approval_id DESC
  `;

  return rows.map(mapApprovalRow);
}

export async function clearProposalApprovalsByTenant(tenantId: string, proposalId: string): Promise<void> {
  await ensureProposalApprovalsTable();

  await prisma.$executeRaw`
    DELETE FROM proposal_approvals
    WHERE tenant_id = ${tenantId}
      AND proposal_id = ${proposalId}
  `;
}

export { evaluateApprovalGate };
export type { ProposalApprovalGate };