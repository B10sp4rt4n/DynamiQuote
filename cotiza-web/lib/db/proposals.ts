import "server-only";

import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type {
  CreateProposalFromQuoteInput,
  ProposalImportItemInput,
  ProposalStatus,
  UpdateProposalWorkflowInput,
} from "@/lib/validations/proposals";

const terminalStatuses: ProposalStatus[] = ["approved", "rejected", "expired"];

const allowedTransitions: Record<ProposalStatus, ProposalStatus[]> = {
  approved: ["approved"],
  draft: ["draft", "sent"],
  expired: ["expired"],
  in_review: ["in_review", "approved", "rejected", "expired"],
  rejected: ["rejected"],
  sent: ["sent", "in_review", "approved", "rejected", "expired"],
};

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
  issuerCompany: string;
  issuerContactName: string;
  issuerEmail: string;
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
};

export type ProposalWorkflowDetail = {
  formal: FormalProposalSlice | null;
  items: ProposalExcelItem[];
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

function dateToIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function decimalToNumber(value: Prisma.Decimal | null | undefined): number {
  return value ? value.toNumber() : 0;
}

function toFormalSlice(row: {
  issuer_company: string;
  issuer_contact_name: string | null;
  issuer_email: string | null;
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
    issuerCompany: row.issuer_company,
    issuerContactName: row.issuer_contact_name ?? "",
    issuerEmail: row.issuer_email ?? "",
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

function canTransition(current: ProposalStatus, next: ProposalStatus): boolean {
  return allowedTransitions[current].includes(next);
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

  const issuerProfile = await prisma.company_logos.findFirst({
    orderBy: [{ is_default: "desc" }, { uploaded_at: "desc" }],
    select: {
      company_name: true,
    },
    where: { tenant_id: tenantId },
  });

  const now = new Date();
  const proposalId = randomUUID();
  const proposalDocId = randomUUID();
  const proposalNumber = await nextProposalNumber(now.getUTCFullYear());
  const issuerContactName = await resolveActorNameForTenant(tenantId, actorName, quote.quoted_by);
  const issuerCompany = issuerProfile?.company_name?.trim() || tenant?.name || "Cotiza";
  const recipientCompany = input.recipientCompany?.trim() || quote.client_name || "Sin cliente";
  const subject = input.subject?.trim() || quote.proposal_name || "Propuesta Comercial";

  await prisma.$transaction(async (tx) => {
    await tx.proposals.create({
      data: {
        closed_at: null,
        created_at: now,
        created_by: issuerContactName,
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
        issued_date: now,
        proposal_doc_id: proposalDocId,
        proposal_id: proposalId,
        proposal_number: proposalNumber,
        quote_id: quote.quote_id,
        recipient_company: recipientCompany,
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
      issuer_company: issuerCompany,
      issuer_contact_name: issuerContactName,
      issuer_email: null,
      issuer_phone: null,
      issued_date: now,
      proposal_doc_id: proposalDocId,
      proposal_number: proposalNumber,
      quote_id: quote.quote_id,
      recipient_company: recipientCompany,
      recipient_contact_name: null,
      recipient_contact_title: null,
      recipient_email: null,
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
): Promise<ProposalSummary[]> {
  const rows = await prisma.proposals.findMany({
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
    orderBy: [{ created_at: "desc" }, { proposal_id: "desc" }],
    take: limit,
    where: {
      tenant_id: tenantId,
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

export async function getProposalWorkflowByTenant(
  tenantId: string,
  proposalId: string,
): Promise<ProposalWorkflowDetail | null> {
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
  const resolvedSalesOwner = await resolveUserDisplayNameByTenant(tenantId, row.created_by);
  const normalizedFormal = latestFormal ? toFormalSlice(latestFormal) : null;

  const issuerLooksOpaque = looksLikeOpaqueUserId(normalizedFormal?.issuerContactName);
  const resolvedIssuerContact =
    (issuerLooksOpaque || isInvalidDisplayName(normalizedFormal?.issuerContactName)
      ? await resolveUserDisplayNameByTenant(tenantId, latestFormal?.issuer_contact_name ?? row.created_by)
      : normalizedFormal?.issuerContactName) ??
    (await getTenantDefaultIssuerName(tenantId));

  return {
    formal: normalizedFormal
      ? {
          ...normalizedFormal,
          issuerContactName: resolvedIssuerContact,
        }
      : null,
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
    salesOwner: resolvedSalesOwner ?? resolvedIssuerContact,
    status: normalizeStatus(latestFormal?.status ?? row.status),
  };
}

export async function updateProposalWorkflowByTenant(
  tenantId: string,
  proposalId: string,
  input: UpdateProposalWorkflowInput,
): Promise<ProposalWorkflowDetail | null> {
  const current = await getProposalWorkflowByTenant(tenantId, proposalId);

  if (!current) {
    return null;
  }

  const currentStatus = current.status;
  const nextStatus = input.status ?? currentStatus;

  if (!canTransition(currentStatus, nextStatus)) {
    throw new Error(`Transicion invalida: ${currentStatus} -> ${nextStatus}`);
  }

  const now = new Date();
  const shouldClose = terminalStatuses.includes(nextStatus);

  await prisma.$transaction(async (tx) => {
    await tx.proposals.update({
      data: {
        closed_at: shouldClose ? now : null,
        status: nextStatus,
      },
      where: {
        proposal_id: proposalId,
      },
    });

    const termsToPersist = input.termsAndConditions;
    const issuerCompanyToPersist = input.issuerCompany;
    const issuerEmailToPersist = input.issuerEmail;
    const issuerPhoneToPersist = input.issuerPhone;
    const subjectToPersist = input.subject;
    const recipientToPersist = input.recipientCompany;
    const recipientContactNameToPersist = input.recipientContactName;
    const recipientEmailToPersist = input.recipientEmail;
    const recipientContactTitleToPersist = input.recipientContactTitle;
    const itemsToPersist = input.items;
    const hasIssuerCompanyUpdate = issuerCompanyToPersist !== undefined;
    const hasIssuerEmailUpdate = issuerEmailToPersist !== undefined;
    const hasIssuerPhoneUpdate = issuerPhoneToPersist !== undefined;
    const hasTermsUpdate = termsToPersist !== undefined;
    const hasSubjectUpdate = subjectToPersist !== undefined;
    const hasRecipientUpdate = recipientToPersist !== undefined;
    const hasRecipientContactNameUpdate = recipientContactNameToPersist !== undefined;
    const hasRecipientEmailUpdate = recipientEmailToPersist !== undefined;
    const hasRecipientContactTitleUpdate = recipientContactTitleToPersist !== undefined;
    const hasItemsUpdate = itemsToPersist !== undefined;
    const hasStatusUpdate = input.status !== undefined;

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
      await tx.proposal_items.deleteMany({
        where: {
          proposal_id: proposalId,
          tenant_id: tenantId,
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
        tenant_id: tenantId,
      },
    });
  });

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
): Promise<ProposalStatusCounts> {
  const rows = await prisma.proposals.groupBy({
    by: ["status"],
    _count: { proposal_id: true },
    where: { tenant_id: tenantId },
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
