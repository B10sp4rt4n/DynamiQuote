import "server-only";

import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

import { getMarginPolicyByTenant } from "@/lib/db/margin-policies";
import {
  clearProposalApprovalsByTenant,
  evaluateApprovalGate,
  getProposalApprovalsByTenant,
  registerProposalApprovalDecisionByTenant,
  type ProposalApprovalGate,
  type ProposalApprovalRecord,
  type ProposalApproverRole,
} from "@/lib/db/proposal-approvals";
import { prisma } from "@/lib/db/prisma";
import {
  evaluateProposalLiberation,
  type ProposalLiberationEvaluation,
} from "@/lib/domain/proposal-liberation";
import type { ProposalIssuanceStatus } from "@/lib/domain/proposal-issuance-gate";
import {
  assertApprovalActorEligibility,
  assertProposalWorkflowGuard,
  canTransitionProposalStatus,
  resolveApprovalGateError,
  shouldClearProposalApprovals,
} from "@/lib/domain/proposal-workflow-guard";
import type {
  CreateProposalFromQuoteInput,
  ProposalImportItemInput,
  ProposalStatus,
  RegisterProposalApprovalInput,
  UpdateProposalWorkflowInput,
} from "@/lib/validations/proposals";

const terminalStatuses: ProposalStatus[] = ["approved", "rejected", "expired"];

const legacyStatusMap: Record<string, ProposalStatus> = {
  "aprobada": "approved",
  "approved": "approved",
  "borrador": "draft",
  "draft": "draft",
  "en revisión": "in_review",
  "en revision": "in_review",
  "in review": "in_review",
  "in_review": "in_review",
  "rechazada": "rejected",
  "rejected": "rejected",
  "sent": "sent",
  "enviada": "sent",
  "vencida": "expired",
  "expired": "expired",
};

function looksLikeOpaqueUserId(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  return /^(ser|user|sess|org)_[A-Za-z0-9]+$/.test(value.trim());
}

function isInvalidDisplayName(value: string | null | undefined): boolean {
  const normalized = value?.trim().toLowerCase() ?? "";

  if (normalized.length === 0) {
    return true;
  }

  if (normalized === "sin asignar" || normalized === "usuario del tenant") {
    return true;
  }

  return looksLikeOpaqueUserId(normalized);
}

function buildHumanName(firstName: string | null | undefined, lastName: string | null | undefined): string | null {
  const fullName = [firstName, lastName]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .trim();

  return fullName.length > 0 ? fullName : null;
}

function normalizeComparableText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function shouldRecomposeRecipientContactName(
  formalName: string,
  formalTitle: string,
  catalogName: string,
): boolean {
  if (!formalName || !formalTitle || !catalogName) {
    return false;
  }

  const normalizedCombined = normalizeComparableText(`${formalName} ${formalTitle}`);
  const normalizedCatalogName = normalizeComparableText(catalogName);
  const isFormalNameSingleToken = formalName.trim().split(/\s+/).length === 1;

  return isFormalNameSingleToken && normalizedCombined === normalizedCatalogName;
}

async function resolveUserDisplayNameByTenant(
  tenantId: string,
  raw: string | null | undefined,
): Promise<string | null> {
  const candidate = raw?.trim() ?? null;

  if (!isInvalidDisplayName(candidate)) {
    return candidate;
  }

  const userById = candidate
    ? await prisma.app_users.findFirst({
        select: {
          alias: true,
          first_name: true,
          last_name: true,
        },
        where: {
          tenant_id: tenantId,
          user_id: candidate,
        },
      })
    : null;

  const fullNameById = buildHumanName(userById?.first_name, userById?.last_name);

  if (!isInvalidDisplayName(fullNameById)) {
    return fullNameById;
  }

  if (!isInvalidDisplayName(userById?.alias)) {
    return userById?.alias?.trim() ?? null;
  }

  const activeAdmin = await prisma.app_users.findFirst({
    orderBy: [{ created_at: "asc" }],
    select: {
      alias: true,
      first_name: true,
      last_name: true,
    },
    where: {
      active: true,
      role: {
        in: ["admin", "owner"],
      },
      tenant_id: tenantId,
    },
  });

  const adminFullName = buildHumanName(activeAdmin?.first_name, activeAdmin?.last_name);

  if (!isInvalidDisplayName(adminFullName)) {
    return adminFullName;
  }

  if (!isInvalidDisplayName(activeAdmin?.alias)) {
    return activeAdmin?.alias?.trim() ?? null;
  }

  const activeUser = await prisma.app_users.findFirst({
    orderBy: [{ created_at: "asc" }],
    select: {
      alias: true,
      first_name: true,
      last_name: true,
    },
    where: {
      active: true,
      tenant_id: tenantId,
    },
  });

  const userFullName = buildHumanName(activeUser?.first_name, activeUser?.last_name);

  if (!isInvalidDisplayName(userFullName)) {
    return userFullName;
  }

  if (!isInvalidDisplayName(activeUser?.alias)) {
    return activeUser?.alias?.trim() ?? null;
  }

  return null;
}

async function getTenantDefaultIssuerName(tenantId: string): Promise<string> {
  const preferred = await resolveUserDisplayNameByTenant(tenantId, null);
  return preferred ?? "Usuario del tenant";
}

async function resolveIssuerEmailByTenant(
  tenantId: string,
  raw: string | null | undefined,
): Promise<string | null> {
  const candidate = raw?.trim() ?? null;

  if (candidate) {
    const byUserId = await prisma.app_users.findFirst({
      select: { email: true },
      where: {
        tenant_id: tenantId,
        user_id: candidate,
      },
    });

    if (byUserId?.email?.trim()) {
      return byUserId.email.trim();
    }

    const byAlias = await prisma.app_users.findFirst({
      select: { email: true },
      where: {
        tenant_id: tenantId,
        alias: candidate,
      },
    });

    if (byAlias?.email?.trim()) {
      return byAlias.email.trim();
    }
  }

  const ownerOrAdmin = await prisma.app_users.findFirst({
    orderBy: [{ created_at: "asc" }],
    select: { email: true },
    where: {
      active: true,
      role: {
        in: ["owner", "admin"],
      },
      tenant_id: tenantId,
    },
  });

  if (ownerOrAdmin?.email?.trim()) {
    return ownerOrAdmin.email.trim();
  }

  return null;
}

async function resolveActorNameForTenant(
  tenantId: string,
  actorName: string | null,
  quoteUser: string | null,
): Promise<string> {
  if (!isInvalidDisplayName(actorName)) {
    return actorName!.trim();
  }

  const fromQuote = await resolveUserDisplayNameByTenant(tenantId, quoteUser);
  if (!isInvalidDisplayName(fromQuote)) {
    return fromQuote!.trim();
  }

  return getTenantDefaultIssuerName(tenantId);
}

type FormalProposalSlice = {
  clientLogoId: string;
  clientLogoDataUrl: string;
  issuerCompany: string;
  issuerContactName: string;
  issuerEmail: string;
  issuerLogoId: string;
  issuerLogoDataUrl: string;
  issuerPhone: string;
  issuedDate: string | null;
  proposalDocId: string;
  proposalNumber: string;
  quoteId: string | null;
  recipientCompany: string;
  recipientContactName: string;
  recipientContactTitle: string;
  recipientEmail: string;
  status: ProposalStatus;
  subject: string;
  termsAndConditions: string;
};

export type ProposalSummary = {
  createdAt: string;
  formal: FormalProposalSlice | null;
  origin: string | null;
  proposalId: string;
  status: ProposalStatus;
  marginEvaluation?: ProposalLiberationEvaluation | null;
};

export type ProposalWorkflowDetail = {
  approvalGate: ProposalApprovalGate;
  approvals: ProposalApprovalRecord[];
  formal: FormalProposalSlice | null;
  // Hay una ventana de override de margen abierta para ALGUIEN (no
  // necesariamente el viewer actual) -- gatea si Owner/Superadmin puede
  // habilitar una nueva ventana (solo una a la vez por propuesta).
  hasOpenMarginOverrideWindow: boolean;
  // La ventana abierta es especificamente para el viewer actual -- gatea el
  // indicador/boton de "Ejecutar override" en la vista del vendedor.
  isPendingOverrideTarget: boolean;
  issuanceStatus: ProposalIssuanceStatus;
  items: ProposalExcelItem[];
  marginEvaluation: ProposalLiberationEvaluation;
  origin: string | null;
  proposalId: string;
  salesOwner: string;
  status: ProposalStatus;
};

export type ProposalExcelItem = {
  componentType: string;
  costUnit: number;
  description: string;
  itemNumber: number;
  origin: string;
  priceUnit: number;
  quantity: number;
  sku: string;
  status: string;
  subtotalCost: number;
  subtotalPrice: number;
};

export type ProposalExcelPayload = {
  formal: FormalProposalSlice | null;
  issuanceStatus: ProposalIssuanceStatus;
  items: ProposalExcelItem[];
  origin: string | null;
  proposalId: string;
  status: ProposalStatus;
};

function normalizeStatus(value: string | null | undefined): ProposalStatus {
  if (!value) {
    return "draft";
  }

  const normalized = legacyStatusMap[value.trim().toLowerCase()];
  return normalized ?? "draft";
}

function normalizeIssuanceStatus(value: string | null | undefined): ProposalIssuanceStatus {
  return value === "force_pending" ? "force_pending" : "normal";
}

function dateToIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function decimalToNumber(value: Prisma.Decimal | null | undefined): number {
  return value ? value.toNumber() : 0;
}

function toFormalSlice(row: {
  client_logo_id?: string | null;
  client_logo_data_url?: string | null;
  issuer_company: string;
  issuer_contact_name: string | null;
  issuer_email: string | null;
  issuer_logo_id?: string | null;
  issuer_logo_data_url?: string | null;
  issuer_phone: string | null;
  issued_date: Date;
  proposal_doc_id: string;
  proposal_number: string;
  quote_id: string | null;
  recipient_company: string;
  recipient_contact_name: string | null;
  recipient_contact_title: string | null;
  recipient_email: string | null;
  status: string | null;
  subject: string | null;
  terms_and_conditions: string | null;
}): FormalProposalSlice {
  return {
    clientLogoId: row.client_logo_id ?? "",
    clientLogoDataUrl: row.client_logo_data_url ?? "",
    issuerCompany: row.issuer_company,
    issuerContactName: row.issuer_contact_name ?? "",
    issuerEmail: row.issuer_email ?? "",
    issuerLogoId: row.issuer_logo_id ?? "",
    issuerLogoDataUrl: row.issuer_logo_data_url ?? "",
    issuerPhone: row.issuer_phone ?? "",
    issuedDate: dateToIso(row.issued_date),
    proposalDocId: row.proposal_doc_id,
    proposalNumber: row.proposal_number,
    quoteId: row.quote_id,
    recipientCompany: row.recipient_company,
    recipientContactName: row.recipient_contact_name ?? "",
    recipientContactTitle: row.recipient_contact_title ?? "",
    recipientEmail: row.recipient_email ?? "",
    status: normalizeStatus(row.status),
    subject: row.subject ?? "Sin asunto",
    termsAndConditions: row.terms_and_conditions ?? "",
  };
}

function toLogoDataUrl(bytes: Uint8Array | null | undefined, format: string | null | undefined): string | null {
  if (!bytes || bytes.length === 0) {
    return null;
  }

  const safeFormat = (format?.trim() || "png").toLowerCase();
  // React-PDF suele fallar al renderizar algunos SVG embebidos en data URL.
  // Si es SVG, omitimos el logo para no romper la generación del PDF.
  if (safeFormat === "svg" || safeFormat === "svg+xml") {
    return null;
  }

  const mime = safeFormat === "svg" || safeFormat === "svg+xml"
    ? "image/svg+xml"
    : `image/${safeFormat}`;

  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

async function resolvePreferredIssuerProfileByTenant(tenantId: string): Promise<{
  companyName: string | null;
  logoId: string;
  sourceTenantId: string | null;
} | null> {
  const tenantDefault = await prisma.company_logos.findFirst({
    orderBy: [{ uploaded_at: "desc" }],
    select: {
      company_name: true,
      logo_id: true,
      tenant_id: true,
    },
    where: {
      is_default: true,
      logo_type: "issuer",
      tenant_id: tenantId,
    },
  });

  if (tenantDefault) {
    return {
      companyName: tenantDefault.company_name,
      logoId: tenantDefault.logo_id,
      sourceTenantId: tenantDefault.tenant_id,
    };
  }

  const globalDefault = await prisma.company_logos.findFirst({
    orderBy: [{ uploaded_at: "desc" }],
    select: {
      company_name: true,
      logo_id: true,
      tenant_id: true,
    },
    where: {
      is_default: true,
      logo_type: "issuer",
      tenant_id: null,
    },
  });

  if (globalDefault) {
    return {
      companyName: globalDefault.company_name,
      logoId: globalDefault.logo_id,
      sourceTenantId: globalDefault.tenant_id,
    };
  }

  const tenantAny = await prisma.company_logos.findFirst({
    orderBy: [{ uploaded_at: "desc" }],
    select: {
      company_name: true,
      logo_id: true,
      tenant_id: true,
    },
    where: {
      logo_type: "issuer",
      tenant_id: tenantId,
    },
  });

  if (tenantAny) {
    return {
      companyName: tenantAny.company_name,
      logoId: tenantAny.logo_id,
      sourceTenantId: tenantAny.tenant_id,
    };
  }

  const globalAny = await prisma.company_logos.findFirst({
    orderBy: [{ uploaded_at: "desc" }],
    select: {
      company_name: true,
      logo_id: true,
      tenant_id: true,
    },
    where: {
      logo_type: "issuer",
      tenant_id: null,
    },
  });

  if (!globalAny) {
    return null;
  }

  return {
    companyName: globalAny.company_name,
    logoId: globalAny.logo_id,
    sourceTenantId: globalAny.tenant_id,
  };
}

async function resolvePreferredIssuerLogoAssetByTenant(tenantId: string): Promise<{
  logo_data: Uint8Array;
  logo_format: string;
} | null> {
  const isSvg = (format: string | null | undefined): boolean => {
    const normalized = (format ?? "").trim().toLowerCase();
    return normalized === "svg" || normalized === "svg+xml";
  };

  const pickBest = async (where: {
    is_default?: boolean;
    logo_type: "issuer";
    tenant_id: string | null;
  }): Promise<{ logo_data: Uint8Array; logo_format: string } | null> => {
    const rows = await prisma.company_logos.findMany({
      orderBy: [{ uploaded_at: "desc" }],
      select: {
        logo_data: true,
        logo_format: true,
      },
      take: 20,
      where,
    });

    const withBytes = rows.filter((row) => row.logo_data?.length > 0);
    if (withBytes.length === 0) return null;

    const raster = withBytes.find((row) => !isSvg(row.logo_format));
    const selected = raster ?? withBytes[0];

    return selected
      ? {
          logo_data: selected.logo_data,
          logo_format: selected.logo_format,
        }
      : null;
  };

  const tenantDefault = await pickBest({ is_default: true, logo_type: "issuer", tenant_id: tenantId });
  const tenantAny = await pickBest({ logo_type: "issuer", tenant_id: tenantId });
  const globalDefault = await pickBest({ is_default: true, logo_type: "issuer", tenant_id: null });
  const globalAny = await pickBest({ logo_type: "issuer", tenant_id: null });

  const candidates = [tenantDefault, tenantAny, globalDefault, globalAny].filter(
    (value): value is { logo_data: Uint8Array; logo_format: string } => value !== null,
  );

  const raster = candidates.find((item) => !isSvg(item.logo_format));
  return raster ?? candidates[0] ?? null;
}

function resolveApproverRole(actor: {
  isSuperAdmin: boolean;
  userRole: "superadmin" | "owner" | "admin" | "user";
}): ProposalApproverRole {
  if (actor.isSuperAdmin) {
    return "superadmin";
  }

  if (actor.userRole === "owner") {
    return "owner";
  }

  if (actor.userRole === "admin") {
    return "admin";
  }

  return "user";
}

async function nextProposalNumber(year: number): Promise<string> {
  const rows = await prisma.formal_proposals.findMany({
    select: { proposal_number: true },
    where: {
      proposal_number: {
        startsWith: `PROP-${year}-`,
      },
    },
  });

  const lastNumber = rows.reduce((max, row) => {
    const current = Number.parseInt(row.proposal_number.split("-").at(-1) ?? "0", 10);
    return Number.isFinite(current) ? Math.max(max, current) : max;
  }, 0);

  return `PROP-${year}-${String(lastNumber + 1).padStart(4, "0")}`;
}

export async function createProposalFromQuoteByTenant(
  tenantId: string,
  input: CreateProposalFromQuoteInput,
  actorName: string | null,
  actorUserId: string | null = null,
): Promise<ProposalSummary | null> {
  const existingProposal = await prisma.proposals.findFirst({
    include: {
      formal_proposals: {
        orderBy: [{ created_at: "desc" }, { proposal_doc_id: "desc" }],
        select: {
          issuer_company: true,
          issuer_contact_name: true,
          issuer_email: true,
          issuer_phone: true,
          issued_date: true,
          proposal_doc_id: true,
          proposal_number: true,
          quote_id: true,
          recipient_company: true,
          recipient_contact_name: true,
          recipient_contact_title: true,
          recipient_email: true,
          status: true,
          subject: true,
          terms_and_conditions: true,
        },
        take: 1,
      },
    },
    where: {
      origin: input.quoteId,
      tenant_id: tenantId,
    },
  });

  if (existingProposal) {
    let latestFormal = existingProposal.formal_proposals[0];
    const normalizedActorName = actorName?.trim() || null;
    const currentIssuerContact = latestFormal?.issuer_contact_name?.trim().toLowerCase() ?? "";
    const shouldBackfillIssuerContact =
      Boolean(normalizedActorName) &&
      (currentIssuerContact.length === 0 ||
        currentIssuerContact === "sin asignar" ||
        looksLikeOpaqueUserId(currentIssuerContact));

    if (shouldBackfillIssuerContact && normalizedActorName) {
      const now = new Date();

      await prisma.$transaction(async (tx) => {
        await tx.proposals.update({
          data: {
            created_by: normalizedActorName,
          },
          where: {
            proposal_id: existingProposal.proposal_id,
          },
        });

        await tx.formal_proposals.updateMany({
          data: {
            issuer_contact_name: normalizedActorName,
            updated_at: now,
          },
          where: {
            proposal_id: existingProposal.proposal_id,
            tenant_id: tenantId,
          },
        });
      });

      latestFormal = latestFormal
        ? {
            ...latestFormal,
            issuer_contact_name: normalizedActorName,
          }
        : latestFormal;
    }

    return {
      createdAt: existingProposal.created_at.toISOString(),
      formal: latestFormal ? toFormalSlice(latestFormal) : null,
      origin: existingProposal.origin,
      proposalId: existingProposal.proposal_id,
      status: normalizeStatus(latestFormal?.status ?? existingProposal.status),
    };
  }

  const quote = await prisma.quote.findFirst({
    select: {
      client_id: true,
      client_name: true,
      proposal_name: true,
      quote_id: true,
      quote_lines: {
        orderBy: [{ created_at: "asc" }, { line_id: "asc" }],
        select: {
          cost_unit: true,
          description_final: true,
          description_original: true,
          final_price_unit: true,
          line_type: true,
          quantity: true,
          service_origin: true,
          sku: true,
        },
      },
      quoted_by: true,
    },
    where: {
      quote_id: input.quoteId,
      tenantId,
    },
  });

  if (!quote) {
    return null;
  }

  const tenant = await prisma.tenant.findUnique({
    select: { name: true },
    where: { tenant_id: tenantId },
  });

  const issuerProfile = await resolvePreferredIssuerProfileByTenant(tenantId);

  // Precarga de datos de contacto desde el catálogo de clientes (Phase 2)
  let catalogContact: {
    clientLogoId: string | null;
    contactName: string | null;
    contactTitle: string | null;
    contactEmail: string | null;
  } | null = null;
  if (quote.client_id) {
    const catalogClient = await prisma.client.findFirst({
      select: { client_logo_id: true, contact_name: true, contact_title: true, contact_email: true },
      where: { client_id: quote.client_id, tenant_id: tenantId },
    });
    if (catalogClient) {
      catalogContact = {
        clientLogoId: catalogClient.client_logo_id ?? null,
        contactName: catalogClient.contact_name ?? null,
        contactTitle: catalogClient.contact_title ?? null,
        contactEmail: catalogClient.contact_email ?? null,
      };
    }
  }

  const now = new Date();
  const proposalId = randomUUID();
  const proposalDocId = randomUUID();
  const proposalNumber = await nextProposalNumber(now.getUTCFullYear());
  const issuerContactName = await resolveActorNameForTenant(tenantId, actorName, quote.quoted_by);
  const isTenantScopedIssuer = issuerProfile?.sourceTenantId === tenantId;
  const issuerCompanyFromProfile = issuerProfile?.companyName?.trim();
  const issuerCompany =
    (isTenantScopedIssuer && issuerCompanyFromProfile) ||
    tenant?.name ||
    issuerCompanyFromProfile ||
    "Cotiza";
  const recipientCompany = input.recipientCompany?.trim() || quote.client_name || "Sin cliente";
  const subject = input.subject?.trim() || quote.proposal_name || "Propuesta Comercial";

  await prisma.$transaction(async (tx) => {
    await tx.proposals.create({
      data: {
        closed_at: null,
        created_at: now,
        created_by: issuerContactName,
        created_by_user_id: actorUserId,
        origin: quote.quote_id,
        proposal_id: proposalId,
        status: "draft",
        tenant_id: tenantId,
      },
    });

    await tx.formal_proposals.create({
      data: {
        created_at: now,
        created_by: issuerContactName,
        issuer_company: issuerCompany,
        issuer_contact_name: issuerContactName,
        issuer_logo_id: issuerProfile?.logoId ?? null,
        issued_date: now,
        proposal_doc_id: proposalDocId,
        proposal_id: proposalId,
        proposal_number: proposalNumber,
        quote_id: quote.quote_id,
        client_logo_id: catalogContact?.clientLogoId ?? null,
        recipient_company: recipientCompany,
        recipient_contact_name: catalogContact?.contactName ?? null,
        recipient_contact_title: catalogContact?.contactTitle ?? null,
        recipient_email: catalogContact?.contactEmail ?? null,
        status: "draft",
        subject,
        tenant_id: tenantId,
        terms_and_conditions: "",
        updated_at: now,
      },
    });

    if (quote.quote_lines.length > 0) {
      await tx.proposal_items.createMany({
        data: quote.quote_lines.map((line, index) => {
          const quantity = decimalToNumber(line.quantity) || 1;
          const costUnit = decimalToNumber(line.cost_unit);
          const priceUnit = decimalToNumber(line.final_price_unit);
          const subtotalCost = quantity * costUnit;
          const subtotalPrice = quantity * priceUnit;

          return {
            component_type: line.line_type || null,
            cost_unit: costUnit,
            created_at: now,
            description: line.description_final ?? line.description_original ?? "Sin descripcion",
            item_id: randomUUID(),
            item_number: index + 1,
            origin: line.service_origin || "manual",
            price_unit: priceUnit,
            proposal_id: proposalId,
            quantity,
            sku: line.sku || null,
            status: "active",
            subtotal_cost: subtotalCost,
            subtotal_price: subtotalPrice,
            tenant_id: tenantId,
            updated_at: now,
          };
        }),
      });
    }
  });

  return {
    createdAt: now.toISOString(),
    formal: toFormalSlice({
      client_logo_id: catalogContact?.clientLogoId ?? null,
      issuer_company: issuerCompany,
      issuer_contact_name: issuerContactName,
      issuer_email: null,
      issuer_logo_id: issuerProfile?.logoId ?? null,
      issuer_phone: null,
      issued_date: now,
      proposal_doc_id: proposalDocId,
      proposal_number: proposalNumber,
      quote_id: quote.quote_id,
      recipient_company: recipientCompany,
      recipient_contact_name: catalogContact?.contactName ?? null,
      recipient_contact_title: catalogContact?.contactTitle ?? null,
      recipient_email: catalogContact?.contactEmail ?? null,
      status: "draft",
      subject,
      terms_and_conditions: "",
    }),
    origin: quote.quote_id,
    proposalId,
    status: "draft",
  };
}

export async function getProposalSummariesByTenant(
  tenantId: string,
  limit = 20,
  viewerUserId: string | null = null,
  canSeeAll = true,
): Promise<ProposalSummary[]> {
  const rows = await prisma.proposals.findMany({
    include: {
      formal_proposals: {
        orderBy: [{ created_at: "desc" }, { proposal_doc_id: "desc" }],
        select: {
          client_logo_id: true,
          issuer_company: true,
          issuer_contact_name: true,
          issuer_email: true,
          issuer_logo_id: true,
          issuer_phone: true,
          issued_date: true,
          proposal_doc_id: true,
          proposal_number: true,
          quote_id: true,
          recipient_company: true,
          recipient_contact_name: true,
          recipient_contact_title: true,
          recipient_email: true,
          status: true,
          subject: true,
          terms_and_conditions: true,
        },
        take: 1,
      },
    },
    orderBy: [{ created_at: "desc" }, { proposal_id: "desc" }],
    take: limit,
    where: {
      tenant_id: tenantId,
      ...(canSeeAll
        ? {}
        : { OR: [{ created_by_user_id: viewerUserId }, { created_by_user_id: null }] }),
    },
  });

  return rows.map((row) => {
    const latestFormal = row.formal_proposals[0];
    const status = normalizeStatus(latestFormal?.status ?? row.status);

    return {
      createdAt: row.created_at.toISOString(),
      formal: latestFormal ? toFormalSlice(latestFormal) : null,
      origin: row.origin,
      proposalId: row.proposal_id,
      status,
    };
  });
}

// Gate de acceso por dueno para rutas de detalle/mutacion por ID. Sin
// canSeeAll, solo el creador o una propuesta huerfana (created_by_user_id
// IS NULL) son visibles -- mismo criterio que getProposalSummariesByTenant.
// Retorna true si no existe (deja que el caller resuelva su propio 404 de
// "no encontrada" en vez de duplicar esa logica aqui), o si es del viewer,
// huerfana, o canSeeAll. Retorna false solo cuando existe y es de otro dueno.
export async function isProposalVisibleToViewer(
  tenantId: string,
  proposalId: string,
  viewerUserId: string | null,
  canSeeAll: boolean,
): Promise<boolean> {
  if (canSeeAll) {
    return true;
  }

  const proposal = await prisma.proposals.findFirst({
    select: { created_by_user_id: true },
    where: { proposal_id: proposalId, tenant_id: tenantId },
  });

  if (!proposal) {
    return true;
  }

  return proposal.created_by_user_id === null || proposal.created_by_user_id === viewerUserId;
}

export async function getProposalWorkflowByTenant(
  tenantId: string,
  proposalId: string,
  options?: { includeLogoData?: boolean; viewerUserId?: string | null },
): Promise<ProposalWorkflowDetail | null> {
  const row = await prisma.proposals.findFirst({
    include: {
      formal_proposals: {
        orderBy: [{ created_at: "desc" }, { proposal_doc_id: "desc" }],
        select: {
          client_logo_id: true,
          issuer_company: true,
          issuer_contact_name: true,
          issuer_email: true,
          issuer_logo_id: true,
          issuer_phone: true,
          issued_date: true,
          proposal_doc_id: true,
          proposal_number: true,
          quote_id: true,
          recipient_company: true,
          recipient_contact_name: true,
          recipient_contact_title: true,
          recipient_email: true,
          status: true,
          subject: true,
          terms_and_conditions: true,
        },
        take: 1,
      },
      proposal_items: {
        orderBy: [{ item_number: "asc" }, { created_at: "asc" }],
        select: {
          component_type: true,
          cost_unit: true,
          description: true,
          item_number: true,
          origin: true,
          price_unit: true,
          quantity: true,
          sku: true,
          status: true,
          subtotal_cost: true,
          subtotal_price: true,
        },
        where: {
          status: {
            not: "deleted",
          },
        },
      },
    },
    where: {
      proposal_id: proposalId,
      tenant_id: tenantId,
    },
  });

  if (!row) {
    return null;
  }

  const latestFormal = row.formal_proposals[0];
  const linkedQuoteId = latestFormal?.quote_id ?? row.origin;

  const catalogClientContact = linkedQuoteId
    ? await prisma.quote.findFirst({
        select: {
          client: {
            select: {
              contact_email: true,
              contact_name: true,
              contact_title: true,
            },
          },
        },
        where: {
          quote_id: linkedQuoteId,
          tenantId,
        },
      })
    : null;

  const catalogContactName = catalogClientContact?.client?.contact_name?.trim() ?? "";
  const catalogContactTitle = catalogClientContact?.client?.contact_title?.trim() ?? "";
  const catalogContactEmail = catalogClientContact?.client?.contact_email?.trim() ?? "";

  const includeLogoData = options?.includeLogoData === true;
  const [issuerLogo, clientLogo] = includeLogoData
    ? await Promise.all([
        latestFormal?.issuer_logo_id
          ? (async () => {
              const issuerLogoId = latestFormal.issuer_logo_id;
              if (!issuerLogoId) {
                return null;
              }

              const tenantLogo = await prisma.company_logos.findFirst({
                select: { logo_data: true, logo_format: true },
                where: {
                  logo_id: issuerLogoId,
                  tenant_id: tenantId,
                },
              });

              if (tenantLogo?.logo_data?.length) {
                return tenantLogo;
              }

              return prisma.company_logos.findFirst({
                select: { logo_data: true, logo_format: true },
                where: {
                  logo_id: issuerLogoId,
                  tenant_id: null,
                },
              });
            })()
          : resolvePreferredIssuerLogoAssetByTenant(tenantId),
        latestFormal?.client_logo_id
          ? (async () => {
              const clientLogoId = latestFormal.client_logo_id;
              if (!clientLogoId) {
                return null;
              }

              const tenantLogo = await prisma.company_logos.findFirst({
                select: { logo_data: true, logo_format: true },
                where: {
                  logo_id: clientLogoId,
                  tenant_id: tenantId,
                },
              });

              if (tenantLogo?.logo_data?.length) {
                return tenantLogo;
              }

              return prisma.company_logos.findFirst({
                select: { logo_data: true, logo_format: true },
                where: {
                  logo_id: clientLogoId,
                  tenant_id: null,
                },
              });
            })()
          // A diferencia del emisor (siempre la misma empresa, tiene sentido
          // un logo "preferido" del tenant como default), el cliente cambia
          // por propuesta. Sin client_logo_id no hay logo que mostrar — nada
          // de caer al logo de cliente subido mas recientemente en el tenant,
          // que podria ser el de cualquier otro cliente sin relacion alguna.
          : Promise.resolve(null),
      ])
    : [null, null];
  const resolvedSalesOwner = await resolveUserDisplayNameByTenant(tenantId, row.created_by);
  const normalizedFormal = latestFormal
    ? toFormalSlice({
        ...latestFormal,
        client_logo_data_url: toLogoDataUrl(clientLogo?.logo_data, clientLogo?.logo_format),
        issuer_logo_data_url: toLogoDataUrl(issuerLogo?.logo_data, issuerLogo?.logo_format),
      })
    : null;
  const formalContactName = normalizedFormal?.recipientContactName?.trim() ?? "";
  const formalContactTitle = normalizedFormal?.recipientContactTitle?.trim() ?? "";
  const formalContactEmail = normalizedFormal?.recipientEmail?.trim() ?? "";

  const useCatalogContactName = formalContactName.length === 0 && catalogContactName.length > 0;
  const useCatalogContactTitle = formalContactTitle.length === 0 && catalogContactTitle.length > 0;
  const useCatalogContactEmail = formalContactEmail.length === 0 && catalogContactEmail.length > 0;
  const recomposeFromCatalog = shouldRecomposeRecipientContactName(
    formalContactName,
    formalContactTitle,
    catalogContactName,
  );

  const enrichedFormal = normalizedFormal
    ? {
        ...normalizedFormal,
        recipientContactName:
          recomposeFromCatalog
            ? catalogContactName
            : (useCatalogContactName ? catalogContactName : normalizedFormal.recipientContactName),
        recipientContactTitle:
          recomposeFromCatalog
            ? (catalogContactTitle || normalizedFormal.recipientContactTitle)
            : (useCatalogContactTitle ? catalogContactTitle : normalizedFormal.recipientContactTitle),
        recipientEmail: useCatalogContactEmail ? catalogContactEmail : normalizedFormal.recipientEmail,
      }
    : null;
  const resolvedIssuerEmail =
    (enrichedFormal?.issuerEmail?.trim() ?? "").length > 0
      ? enrichedFormal?.issuerEmail ?? ""
      : (await resolveIssuerEmailByTenant(tenantId, latestFormal?.issuer_contact_name ?? row.created_by)) ?? "";
  const marginPolicy = await getMarginPolicyByTenant(tenantId);
  const proposalItems = row.proposal_items.map((item) => ({
    componentType: item.component_type ?? "",
    costUnit: decimalToNumber(item.cost_unit),
    description: item.description ?? "",
    itemNumber: item.item_number,
    origin: item.origin ?? "",
    priceUnit: decimalToNumber(item.price_unit),
    quantity: decimalToNumber(item.quantity),
    sku: item.sku ?? "",
    status: item.status,
    subtotalCost: decimalToNumber(item.subtotal_cost),
    subtotalPrice: decimalToNumber(item.subtotal_price),
  }));
  const marginEvaluation = evaluateProposalLiberation(marginPolicy, proposalItems);
  const approvals = await getProposalApprovalsByTenant(tenantId, proposalId);
  const approvalGate = evaluateApprovalGate({
    approvals,
    requireObserverApproval: marginPolicy.requireObserverApproval,
  });

  const issuerLooksOpaque = looksLikeOpaqueUserId(normalizedFormal?.issuerContactName);
  const resolvedIssuerContact =
    (issuerLooksOpaque || isInvalidDisplayName(normalizedFormal?.issuerContactName)
      ? await resolveUserDisplayNameByTenant(tenantId, latestFormal?.issuer_contact_name ?? row.created_by)
      : normalizedFormal?.issuerContactName) ??
    (await getTenantDefaultIssuerName(tenantId));

  return {
    approvalGate,
    approvals,
    formal: enrichedFormal
      ? {
          ...enrichedFormal,
        issuerEmail: resolvedIssuerEmail,
          issuerContactName: resolvedIssuerContact,
        }
      : null,
    hasOpenMarginOverrideWindow: row.margin_override_target_user_id !== null,
    isPendingOverrideTarget:
      row.margin_override_target_user_id !== null &&
      row.margin_override_target_user_id === (options?.viewerUserId ?? null),
    issuanceStatus: normalizeIssuanceStatus(row.issuance_status),
    items: proposalItems,
    marginEvaluation,
    origin: row.origin,
    proposalId: row.proposal_id,
    salesOwner: resolvedSalesOwner ?? resolvedIssuerContact,
    status: normalizeStatus(latestFormal?.status ?? row.status),
  };
}

// Consume un forzamiento de emision activo (issuance_status === "force_pending")
// al momento en que una de las 3 rutas de entrega (pdf, send-email, xlsx) lo
// usa. Es de un solo uso: el UPDATE condicionado por WHERE issuance_status =
// 'force_pending' actua como guardia contra doble consumo si dos rutas se
// disparan casi al mismo tiempo -- solo la primera transaccion que llega
// encuentra la fila en ese estado.
export async function consumeProposalIssuanceForce(input: {
  consumedBy: string | null;
  consumedVia: "pdf" | "email" | "xlsx";
  proposalId: string;
  tenantId: string;
}): Promise<void> {
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const updated = await tx.proposals.updateMany({
      data: { issuance_status: "normal" },
      where: {
        issuance_status: "force_pending",
        proposal_id: input.proposalId,
        tenant_id: input.tenantId,
      },
    });

    if (updated.count === 0) {
      return;
    }

    await tx.proposal_audit_events.create({
      data: {
        created_at: now,
        event_hash: randomUUID(),
        event_id: randomUUID(),
        event_type: "proposal_force_issue_consumed",
        payload: JSON.stringify({
          consumedAt: now.toISOString(),
          consumedBy: input.consumedBy,
          consumedVia: input.consumedVia,
        }),
        proposal_id: input.proposalId,
        tenant_id: input.tenantId,
      },
    });
  });
}

// Habilita una ventana de override de margen de un solo uso, para que el
// vendedor dueño de la propuesta (proposals.created_by_user_id) pueda
// ejecutarla el mismo via POST .../override/execute. El motivo y quien
// habilita se documentan hasta que se ejecute o se cierre -- ver
// executeMarginOverride y el hook de cierre en updateProposalWorkflowByTenant.
// Falla explicitamente si la propuesta no esta bloqueada por margen, si la
// transicion a "approved" no es valida desde el status actual, si ya hay
// una ventana abierta, o si no hay un vendedor identificado (huerfana).
export async function grantMarginOverrideWindow(input: {
  proposalId: string;
  tenantId: string;
}): Promise<ProposalWorkflowDetail | null> {
  const current = await getProposalWorkflowByTenant(input.tenantId, input.proposalId);

  if (!current) {
    return null;
  }

  if (current.marginEvaluation.canAuthorizeFinal) {
    throw new Error("Esta propuesta no esta bloqueada por margen, no aplica override.");
  }

  if (!canTransitionProposalStatus(current.status, "approved")) {
    throw new Error(`Transicion invalida: ${current.status} -> approved`);
  }

  const row = await prisma.proposals.findFirst({
    select: { created_by_user_id: true },
    where: { proposal_id: input.proposalId, tenant_id: input.tenantId },
  });

  if (!row?.created_by_user_id) {
    throw new Error(
      "Esta propuesta no tiene un vendedor identificado (created_by_user_id vacio); no se puede habilitar la ventana de override.",
    );
  }

  const updated = await prisma.proposals.updateMany({
    data: { margin_override_target_user_id: row.created_by_user_id },
    where: {
      margin_override_target_user_id: null,
      proposal_id: input.proposalId,
      tenant_id: input.tenantId,
    },
  });

  if (updated.count === 0) {
    throw new Error("Ya hay una ventana de override pendiente de consumir para esta propuesta.");
  }

  return getProposalWorkflowByTenant(input.tenantId, input.proposalId);
}

// Ejecuta el override de margen: mueve la propuesta directo a "approved"
// saltandose unicamente el check de margen del guard (bypassMarginGuard),
// sin pasar por assertApprovalActorEligibility ni evaluateApprovalGate -- la
// autoridad ya se valido en el endpoint (Owner/Superadmin elegible, o el
// vendedor destinatario de una ventana abierta), no depende del rol de
// quien ejecuta materialmente. Inserta UNA sola fila en proposal_approvals
// (decision:'overridden'), distinguible de una aprobacion normal, con
// approverUserId (quien documento el motivo) y executedByUserId (quien
// ejecuto materialmente) -- pueden ser la misma persona (B1) o no (B2).
export async function executeMarginOverride(input: {
  approverRole: ProposalApproverRole;
  approverUserId: string;
  executedByUserId: string;
  proposalId: string;
  reason: string;
  tenantId: string;
}): Promise<ProposalWorkflowDetail | null> {
  const current = await getProposalWorkflowByTenant(input.tenantId, input.proposalId);

  if (!current) {
    return null;
  }

  if (current.marginEvaluation.canAuthorizeFinal) {
    throw new Error("Esta propuesta no esta bloqueada por margen, no aplica override.");
  }

  assertProposalWorkflowGuard({
    allowApprovedTermsUpdate: false,
    bypassMarginGuard: true,
    currentStatus: current.status,
    hasContentUpdate: false,
    marginCanAuthorizeFinal: current.marginEvaluation.canAuthorizeFinal,
    nextStatus: "approved",
  });

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.proposals.update({
      data: {
        closed_at: now,
        margin_override_target_user_id: null,
        status: "approved",
      },
      where: { proposal_id: input.proposalId },
    });

    await tx.formal_proposals.updateMany({
      data: { status: "approved", updated_at: now },
      where: { proposal_id: input.proposalId },
    });

    await registerProposalApprovalDecisionByTenant(
      {
        approverRole: input.approverRole,
        approverUserId: input.approverUserId,
        decision: "overridden",
        executedByUserId: input.executedByUserId,
        proposalId: input.proposalId,
        reason: input.reason,
        tenantId: input.tenantId,
      },
      tx,
    );
  });

  return getProposalWorkflowByTenant(input.tenantId, input.proposalId);
}

export async function updateProposalWorkflowByTenant(
  tenantId: string,
  proposalId: string,
  input: UpdateProposalWorkflowInput,
  actor?: {
    isSuperAdmin: boolean;
    userId: string | null;
    userRole: "superadmin" | "owner" | "admin" | "user";
  },
): Promise<ProposalWorkflowDetail | null> {
  const current = await getProposalWorkflowByTenant(tenantId, proposalId);

  if (!current) {
    return null;
  }

  const currentStatus = current.status;
  const currentFormal = current.formal;
  let nextStatus = input.status ?? currentStatus;
  const hasStatusUpdate = nextStatus !== currentStatus;
  const hasTermsUpdate =
    input.termsAndConditions !== undefined &&
    input.termsAndConditions !== (currentFormal?.termsAndConditions ?? "");
  const hasSubjectUpdate =
    input.subject !== undefined &&
    input.subject !== (currentFormal?.subject ?? "");
  const hasRecipientUpdate =
    input.recipientCompany !== undefined &&
    input.recipientCompany !== (currentFormal?.recipientCompany ?? "");
  const hasIssuerCompanyUpdate =
    input.issuerCompany !== undefined &&
    input.issuerCompany !== (currentFormal?.issuerCompany ?? "");
  const issuerEmailInput = input.issuerEmail?.trim();
  const hasIssuerEmailUpdate =
    issuerEmailInput !== undefined &&
    issuerEmailInput.length > 0 &&
    issuerEmailInput !== (currentFormal?.issuerEmail ?? "");
  const hasIssuerPhoneUpdate =
    input.issuerPhone !== undefined &&
    input.issuerPhone !== (currentFormal?.issuerPhone ?? "");
  const hasRecipientContactNameUpdate =
    input.recipientContactName !== undefined &&
    input.recipientContactName !== (currentFormal?.recipientContactName ?? "");
  const hasRecipientEmailUpdate =
    input.recipientEmail !== undefined &&
    input.recipientEmail !== (currentFormal?.recipientEmail ?? "");
  const hasRecipientContactTitleUpdate =
    input.recipientContactTitle !== undefined &&
    input.recipientContactTitle !== (currentFormal?.recipientContactTitle ?? "");
  const normalizedCurrentItems = current.items.map((item) => ({
    componentType: item.componentType,
    costUnit: item.costUnit,
    description: item.description,
    itemNumber: item.itemNumber,
    origin: item.origin,
    priceUnit: item.priceUnit,
    quantity: item.quantity,
    sku: item.sku,
    status: item.status,
  }));
  const normalizedInputItems = input.items?.map((item) => ({
    componentType: item.componentType,
    costUnit: item.costUnit,
    description: item.description,
    itemNumber: item.itemNumber,
    origin: item.origin,
    priceUnit: item.priceUnit,
    quantity: item.quantity,
    sku: item.sku,
    status: item.status,
  }));
  const hasItemsUpdate =
    input.items !== undefined &&
    JSON.stringify(normalizedInputItems) !== JSON.stringify(normalizedCurrentItems);
  const hasContentUpdate =
    hasTermsUpdate ||
    hasSubjectUpdate ||
    hasRecipientUpdate ||
    hasIssuerCompanyUpdate ||
    hasIssuerEmailUpdate ||
    hasIssuerPhoneUpdate ||
    hasRecipientContactNameUpdate ||
    hasRecipientEmailUpdate ||
    hasRecipientContactTitleUpdate ||
    hasItemsUpdate;
  const hasNonTermsContentUpdate =
    hasSubjectUpdate ||
    hasRecipientUpdate ||
    hasIssuerCompanyUpdate ||
    hasIssuerEmailUpdate ||
    hasIssuerPhoneUpdate ||
    hasRecipientContactNameUpdate ||
    hasRecipientEmailUpdate ||
    hasRecipientContactTitleUpdate ||
    hasItemsUpdate;
  const hasApprovedSafeContactUpdate =
    hasIssuerEmailUpdate ||
    hasIssuerPhoneUpdate ||
    hasRecipientContactNameUpdate ||
    hasRecipientEmailUpdate ||
    hasRecipientContactTitleUpdate;
  const hasApprovedMaterialUpdate =
    hasSubjectUpdate ||
    hasRecipientUpdate ||
    hasIssuerCompanyUpdate ||
    hasItemsUpdate;
  const allowApprovedTermsUpdate =
    (hasTermsUpdate || hasApprovedSafeContactUpdate) &&
    !hasApprovedMaterialUpdate;

  const policy = await getMarginPolicyByTenant(tenantId);
  const candidateItems = hasItemsUpdate && input.items ? input.items : current.items;
  const marginEvaluation = evaluateProposalLiberation(policy, candidateItems);

  assertProposalWorkflowGuard({
    allowApprovedTermsUpdate,
    currentStatus,
    hasContentUpdate,
    marginCanAuthorizeFinal: marginEvaluation.canAuthorizeFinal,
    nextStatus,
  });

  if (shouldClearProposalApprovals(hasContentUpdate, current.approvals.length)) {
    await clearProposalApprovalsByTenant(tenantId, proposalId);
  }

  // Auto-aprobacion al someter un borrador cuyo margen ya esta dentro de
  // politica: la decide la politica de margen, no una persona, asi que
  // cualquier rol puede completarla — no se exige elegibilidad de aprobador.
  // Si el tenant exige un observador (requireObserverApproval) y quien
  // somete no lo satisface por si solo, la propuesta cae a "in_review" en
  // vez de fallar con un error. Cualquier otra transicion a "approved"
  // (ej. "Cliente acepto" desde estado "sent", o una decision manual)
  // mantiene el chequeo estricto de elegibilidad + gate, sin cambios.
  const isDraftMarginAutoApproval = hasStatusUpdate && nextStatus === "approved" && currentStatus === "draft";
  const skipApprovalGate = isDraftMarginAutoApproval && !policy.requireObserverApproval;

  if (hasStatusUpdate && nextStatus === "approved" && !skipApprovalGate) {
    const actorUserId = actor?.userId ?? null;
    const approverRole = resolveApproverRole(
      actor ?? {
        isSuperAdmin: false,
        userRole: "user",
      },
    );

    if (!isDraftMarginAutoApproval) {
      assertApprovalActorEligibility({ approverRole, userId: actorUserId });
    }

    if (!actorUserId) {
      throw new Error("No se pudo identificar al aprobador.");
    }

    const existingApprovals = await getProposalApprovalsByTenant(tenantId, proposalId);
    const hasCurrentActorApproval = existingApprovals.some(
      (row) =>
        row.decision === "approved" &&
        row.approverRole === approverRole &&
        row.approverUserId === actorUserId,
    );

    if (!hasCurrentActorApproval) {
      await registerProposalApprovalDecisionByTenant({
        approverRole,
        approverUserId: actorUserId,
        decision: "approved",
        proposalId,
        tenantId,
      });
    }

    // Validar que ya existen aprobaciones requeridas antes de cerrar la propuesta
    const approvals = await getProposalApprovalsByTenant(tenantId, proposalId);
    const gate = evaluateApprovalGate({
      approvals,
      requireObserverApproval: policy.requireObserverApproval,
    });

    if (!gate.canAuthorizeFinal) {
      if (isDraftMarginAutoApproval) {
        // No se pudo auto-aprobar sin el observador requerido: pasa a
        // revision manual en vez de fallar para quien la sometio.
        nextStatus = "in_review";
      } else {
        const gateError = resolveApprovalGateError(gate.missingRoles);
        if (gateError) {
          throw new Error(gateError);
        }
      }
    }
  }

  const now = new Date();
  const shouldClose = terminalStatuses.includes(nextStatus);

  await prisma.$transaction(async (tx) => {
    await tx.proposals.update({
      data: {
        closed_at: shouldClose ? now : null,
        // Si el status cambia por esta via (la normal: Aprobar/Rechazar/
        // "Cliente acepto"/etc.), cierra cualquier ventana de override de
        // margen pendiente sin consumirla -- no se inserta fila en
        // proposal_approvals, simplemente deja de estar disponible para el
        // vendedor. Distinto de executeMarginOverride, que la consume con
        // registro cuando SI se ejecuta.
        ...(hasStatusUpdate ? { margin_override_target_user_id: null } : {}),
        status: nextStatus,
      },
      where: {
        proposal_id: proposalId,
      },
    });

    const termsToPersist = input.termsAndConditions;
    const issuerCompanyToPersist = input.issuerCompany;
    const issuerEmailToPersist = issuerEmailInput;
    const issuerPhoneToPersist = input.issuerPhone;
    const subjectToPersist = input.subject;
    const recipientToPersist = input.recipientCompany;
    const recipientContactNameToPersist = input.recipientContactName;
    const recipientEmailToPersist = input.recipientEmail;
    const recipientContactTitleToPersist = input.recipientContactTitle;
    const itemsToPersist = input.items;
    if (
      !hasTermsUpdate &&
      !hasStatusUpdate &&
      !hasSubjectUpdate &&
      !hasRecipientUpdate &&
      !hasIssuerCompanyUpdate &&
      !hasIssuerEmailUpdate &&
      !hasIssuerPhoneUpdate &&
      !hasRecipientContactNameUpdate &&
      !hasRecipientEmailUpdate &&
      !hasRecipientContactTitleUpdate
    ) {
      if (!hasItemsUpdate) {
        return;
      }
    }

    if (hasItemsUpdate && itemsToPersist) {
      // Solo filtrar por proposal_id: la validación de tenant se hizo en getProposalWorkflowByTenant
      await tx.proposal_items.deleteMany({
        where: {
          proposal_id: proposalId,
        },
      });

      await tx.proposal_items.createMany({
        data: itemsToPersist.map((item) => {
          const subtotalCost = item.quantity * item.costUnit;
          const subtotalPrice = item.quantity * item.priceUnit;

          return {
            component_type: item.componentType || null,
            cost_unit: item.costUnit,
            created_at: now,
            description: item.description || null,
            item_id: randomUUID(),
            item_number: item.itemNumber,
            origin: item.origin || null,
            price_unit: item.priceUnit,
            proposal_id: proposalId,
            quantity: item.quantity,
            sku: item.sku || null,
            status: item.status || "active",
            subtotal_cost: subtotalCost,
            subtotal_price: subtotalPrice,
            tenant_id: tenantId,
            updated_at: now,
          };
        }),
      });
    }

    if (
      !hasTermsUpdate &&
      !hasStatusUpdate &&
      !hasSubjectUpdate &&
      !hasRecipientUpdate &&
      !hasIssuerCompanyUpdate &&
      !hasIssuerEmailUpdate &&
      !hasIssuerPhoneUpdate &&
      !hasRecipientContactNameUpdate &&
      !hasRecipientEmailUpdate &&
      !hasRecipientContactTitleUpdate
    ) {
      return;
    }

    // Solo filtrar por proposal_id: la validación de tenant se hizo en getProposalWorkflowByTenant
    await tx.formal_proposals.updateMany({
      data: {
        issuer_company: hasIssuerCompanyUpdate ? issuerCompanyToPersist : undefined,
        issuer_email: hasIssuerEmailUpdate ? issuerEmailToPersist : undefined,
        issuer_phone: hasIssuerPhoneUpdate ? issuerPhoneToPersist : undefined,
        recipient_company: hasRecipientUpdate ? recipientToPersist : undefined,
        recipient_contact_name: hasRecipientContactNameUpdate
          ? recipientContactNameToPersist
          : undefined,
        recipient_contact_title: hasRecipientContactTitleUpdate
          ? recipientContactTitleToPersist
          : undefined,
        recipient_email: hasRecipientEmailUpdate ? recipientEmailToPersist : undefined,
        sent_at: nextStatus === "sent" ? now : undefined,
        status: hasStatusUpdate ? nextStatus : undefined,
        subject: hasSubjectUpdate ? subjectToPersist : undefined,
        terms_and_conditions: hasTermsUpdate ? termsToPersist : undefined,
        updated_at: now,
      },
      where: {
        proposal_id: proposalId,
      },
    });
  });

  return getProposalWorkflowByTenant(tenantId, proposalId);
}

export async function registerProposalApprovalByTenant(
  tenantId: string,
  proposalId: string,
  input: RegisterProposalApprovalInput,
  actor: {
    isSuperAdmin: boolean;
    userId: string | null;
    userRole: "superadmin" | "owner" | "admin" | "user";
  },
): Promise<ProposalWorkflowDetail | null> {
  const current = await getProposalWorkflowByTenant(tenantId, proposalId);

  if (!current) {
    return null;
  }

  if (!actor.userId) {
    throw new Error("No se pudo identificar al aprobador.");
  }

  const approverRole = resolveApproverRole(actor);

  if (approverRole === "user") {
    throw new Error("Solo Owner, Admin o Superadmin pueden participar en aprobaciones.");
  }

  const hasSameDecision = current.approvals.some(
    (row) =>
      row.approverUserId === actor.userId &&
      row.approverRole === approverRole &&
      row.decision === input.decision,
  );

  if (!hasSameDecision) {
    await registerProposalApprovalDecisionByTenant({
      approverRole,
      approverUserId: actor.userId,
      decision: input.decision,
      proposalId,
      reason: input.reason ?? null,
      tenantId,
    });
  }

  return getProposalWorkflowByTenant(tenantId, proposalId);
}

export async function getProposalExcelPayloadByTenant(
  tenantId: string,
  proposalId: string,
): Promise<ProposalExcelPayload | null> {
  const row = await prisma.proposals.findFirst({
    include: {
      formal_proposals: {
        orderBy: [{ created_at: "desc" }, { proposal_doc_id: "desc" }],
        select: {
          issuer_company: true,
          issuer_contact_name: true,
          issuer_email: true,
          issuer_phone: true,
          issued_date: true,
          proposal_doc_id: true,
          proposal_number: true,
          quote_id: true,
          recipient_company: true,
          recipient_contact_name: true,
          recipient_contact_title: true,
          recipient_email: true,
          status: true,
          subject: true,
          terms_and_conditions: true,
        },
        take: 1,
      },
      proposal_items: {
        orderBy: [{ item_number: "asc" }, { created_at: "asc" }],
        select: {
          component_type: true,
          cost_unit: true,
          description: true,
          item_number: true,
          origin: true,
          price_unit: true,
          quantity: true,
          sku: true,
          status: true,
          subtotal_cost: true,
          subtotal_price: true,
        },
      },
    },
    where: {
      proposal_id: proposalId,
      tenant_id: tenantId,
    },
  });

  if (!row) {
    return null;
  }

  const latestFormal = row.formal_proposals[0];

  return {
    formal: latestFormal ? toFormalSlice(latestFormal) : null,
    issuanceStatus: normalizeIssuanceStatus(row.issuance_status),
    items: row.proposal_items.map((item) => ({
      componentType: item.component_type ?? "",
      costUnit: decimalToNumber(item.cost_unit),
      description: item.description ?? "",
      itemNumber: item.item_number,
      origin: item.origin ?? "",
      priceUnit: decimalToNumber(item.price_unit),
      quantity: decimalToNumber(item.quantity),
      sku: item.sku ?? "",
      status: item.status,
      subtotalCost: decimalToNumber(item.subtotal_cost),
      subtotalPrice: decimalToNumber(item.subtotal_price),
    })),
    origin: row.origin,
    proposalId: row.proposal_id,
    status: normalizeStatus(latestFormal?.status ?? row.status),
  };
}

export async function importProposalItemsByTenant(
  tenantId: string,
  proposalId: string,
  items: ProposalImportItemInput[],
): Promise<{ importedCount: number; proposalId: string } | null> {
  const proposal = await prisma.proposals.findFirst({
    select: {
      proposal_id: true,
    },
    where: {
      proposal_id: proposalId,
      tenant_id: tenantId,
    },
  });

  if (!proposal) {
    return null;
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.proposal_items.deleteMany({
      where: {
        proposal_id: proposalId,
        tenant_id: tenantId,
      },
    });

    await tx.proposal_items.createMany({
      data: items.map((item) => {
        const subtotalCost = item.quantity * item.costUnit;
        const subtotalPrice = item.quantity * item.priceUnit;

        return {
          component_type: item.componentType || null,
          cost_unit: item.costUnit,
          created_at: now,
          description: item.description || null,
          item_id: randomUUID(),
          item_number: item.itemNumber,
          origin: item.origin || null,
          price_unit: item.priceUnit,
          proposal_id: proposalId,
          quantity: item.quantity,
          sku: item.sku || null,
          status: item.status || "active",
          subtotal_cost: subtotalCost,
          subtotal_price: subtotalPrice,
          tenant_id: tenantId,
          updated_at: now,
        };
      }),
    });
  });

  return {
    importedCount: items.length,
    proposalId: proposal.proposal_id,
  };
}

export type ProposalStatusCounts = {
  approved: number;
  draft: number;
  expired: number;
  in_review: number;
  rejected: number;
  sent: number;
  total: number;
};

export async function getProposalStatusCountsByTenant(
  tenantId: string,
  viewerUserId: string | null = null,
  canSeeAll = true,
): Promise<ProposalStatusCounts> {
  const rows = await prisma.proposals.groupBy({
    by: ["status"],
    _count: { proposal_id: true },
    where: {
      tenant_id: tenantId,
      ...(canSeeAll
        ? {}
        : { OR: [{ created_by_user_id: viewerUserId }, { created_by_user_id: null }] }),
    },
  });

  const counts: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    const status = legacyStatusMap[row.status ?? "draft"] ?? "draft";
    counts[status] = (counts[status] ?? 0) + row._count.proposal_id;
    total += row._count.proposal_id;
  }

  return {
    approved: counts["approved"] ?? 0,
    draft: counts["draft"] ?? 0,
    expired: counts["expired"] ?? 0,
    in_review: counts["in_review"] ?? 0,
    rejected: counts["rejected"] ?? 0,
    sent: counts["sent"] ?? 0,
    total,
  };
}

export async function getProposalMarginBlockedCountByTenant(
  tenantId: string,
  viewerUserId: string | null = null,
  canSeeAll = true,
): Promise<number> {
  const activeStatuses = ["draft", "sent", "in_review"];

  const rows = await prisma.proposals.findMany({
    select: {
      proposal_id: true,
      proposal_items: {
        select: {
          cost_unit: true,
          price_unit: true,
          quantity: true,
        },
        where: {
          status: {
            not: "deleted",
          },
        },
      },
    },
    where: {
      tenant_id: tenantId,
      status: { in: activeStatuses },
      ...(canSeeAll
        ? {}
        : { OR: [{ created_by_user_id: viewerUserId }, { created_by_user_id: null }] }),
    },
  });

  if (rows.length === 0) {
    return 0;
  }

  const policy = await getMarginPolicyByTenant(tenantId);
  let blocked = 0;

  for (const row of rows) {
    const items = row.proposal_items.map((item) => ({
      costUnit: decimalToNumber(item.cost_unit),
      priceUnit: decimalToNumber(item.price_unit),
      quantity: decimalToNumber(item.quantity),
    }));

    const evaluation = evaluateProposalLiberation(policy, items);

    if (!evaluation.canAuthorizeFinal) {
      blocked += 1;
    }
  }

  return blocked;
}
