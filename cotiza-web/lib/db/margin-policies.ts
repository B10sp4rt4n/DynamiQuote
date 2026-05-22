import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { MarginPolicyInput } from "@/lib/validations/margin-policy";

export type MarginPolicySummary = {
  createdAt: string | null;
  createdBy: string | null;
  highPreapprovalMarginPct: number;
  maxMarginPct: number;
  minMarginPct: number;
  ownerRequired: true;
  requireObserverApproval: boolean;
  tenantId: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

type MarginPolicyRow = {
  created_at: Date | string | null;
  created_by: string | null;
  high_preapproval_margin_pct: unknown;
  max_margin_pct: unknown;
  min_margin_pct: unknown;
  require_observer_approval: boolean;
  tenant_id: string;
  updated_at: Date | string | null;
  updated_by: string | null;
};

const DEFAULT_POLICY: Omit<MarginPolicySummary, "tenantId"> = {
  createdAt: null,
  createdBy: null,
  highPreapprovalMarginPct: 55,
  maxMarginPct: 35,
  minMarginPct: 10,
  ownerRequired: true,
  requireObserverApproval: false,
  updatedAt: null,
  updatedBy: null,
};

let marginPolicyTableReady = false;

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapRow(row: MarginPolicyRow | null, tenantId: string): MarginPolicySummary {
  if (!row) {
    return {
      ...DEFAULT_POLICY,
      tenantId,
    };
  }

  return {
    createdAt: toIso(row.created_at),
    createdBy: row.created_by,
    highPreapprovalMarginPct: toNumber(row.high_preapproval_margin_pct),
    maxMarginPct: toNumber(row.max_margin_pct),
    minMarginPct: toNumber(row.min_margin_pct),
    ownerRequired: true,
    requireObserverApproval: row.require_observer_approval,
    tenantId: row.tenant_id,
    updatedAt: toIso(row.updated_at),
    updatedBy: row.updated_by,
  };
}

async function ensureMarginPolicyTable(): Promise<void> {
  if (marginPolicyTableReady) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS tenant_margin_policies (
      tenant_id TEXT PRIMARY KEY REFERENCES tenants(tenant_id) ON DELETE CASCADE ON UPDATE CASCADE,
      min_margin_pct NUMERIC(5,2) NOT NULL,
      max_margin_pct NUMERIC(5,2) NOT NULL,
      high_preapproval_margin_pct NUMERIC(5,2) NOT NULL,
      require_observer_approval BOOLEAN NOT NULL DEFAULT FALSE,
      created_by TEXT,
      updated_by TEXT,
      created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
    )
  `);

  marginPolicyTableReady = true;
}

export async function getMarginPolicyByTenant(tenantId: string): Promise<MarginPolicySummary> {
  await ensureMarginPolicyTable();

  const rows = await prisma.$queryRaw<MarginPolicyRow[]>`
    SELECT
      tenant_id,
      min_margin_pct,
      max_margin_pct,
      high_preapproval_margin_pct,
      require_observer_approval,
      created_by,
      updated_by,
      created_at,
      updated_at
    FROM tenant_margin_policies
    WHERE tenant_id = ${tenantId}
    LIMIT 1
  `;

  return mapRow(rows[0] ?? null, tenantId);
}

export async function upsertMarginPolicyByTenant({
  actorUserId,
  tenantId,
  payload,
}: {
  actorUserId: string | null;
  payload: MarginPolicyInput;
  tenantId: string;
}): Promise<MarginPolicySummary> {
  await ensureMarginPolicyTable();

  await prisma.$executeRaw`
    INSERT INTO tenant_margin_policies (
      tenant_id,
      min_margin_pct,
      max_margin_pct,
      high_preapproval_margin_pct,
      require_observer_approval,
      created_by,
      updated_by,
      created_at,
      updated_at
    )
    VALUES (
      ${tenantId},
      ${payload.minMarginPct},
      ${payload.maxMarginPct},
      ${payload.highPreapprovalMarginPct},
      ${payload.requireObserverApproval},
      ${actorUserId},
      ${actorUserId},
      NOW(),
      NOW()
    )
    ON CONFLICT (tenant_id) DO UPDATE SET
      min_margin_pct = EXCLUDED.min_margin_pct,
      max_margin_pct = EXCLUDED.max_margin_pct,
      high_preapproval_margin_pct = EXCLUDED.high_preapproval_margin_pct,
      require_observer_approval = EXCLUDED.require_observer_approval,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
  `;

  return getMarginPolicyByTenant(tenantId);
}