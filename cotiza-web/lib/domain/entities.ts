export const proposalStatusValues = [
  "draft",
  "sent",
  "in_review",
  "approved",
  "rejected",
  "expired",
] as const;

export type ProposalStatus = (typeof proposalStatusValues)[number];

export const quoteClassificationOneValues = ["product", "service"] as const;

export type QuoteClassificationOne = (typeof quoteClassificationOneValues)[number];

export type TenantEntity = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
};

export type UserEntity = {
  id: string;
  tenantId: string;
  clerkUserId: string | null;
  email: string | null;
  fullName: string | null;
  active: boolean;
};

export type EmisorProfileEntity = {
  id: string;
  tenantId: string;
  name: string;
  companyName: string | null;
  logoFormat: string | null;
  isDefault: boolean;
};

export type DictionaryItemEntity = {
  id: string;
  tenantId: string;
  group: "classification2" | "industry" | "other";
  key: string;
  value: string;
  active: boolean;
};

export type PackageEntity = {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string | null;
};

export type PackageLineEntity = {
  id: string;
  packageId: string;
  sku: string | null;
  description: string;
  quantity: number;
  costUnit: number;
  priceUnit: number | null;
  marginPct: number | null;
  classification1: QuoteClassificationOne;
  classification2: string | null;
};

export type QuoteLineEntity = {
  id: string;
  quoteId: string;
  sku: string | null;
  description: string;
  quantity: number;
  costUnit: number;
  priceUnit: number | null;
  marginPct: number | null;
  classification1: QuoteClassificationOne;
  classification2: string | null;
};

export type QuoteEntity = {
  id: string;
  groupId: string;
  tenantId: string;
  code: string;
  version: number;
  clientName: string | null;
  proposalName: string | null;
  quotedBy: string | null;
  totalCost: number | null;
  totalRevenue: number | null;
  grossProfit: number | null;
  avgMargin: number | null;
  createdAt: string | null;
};

export type ProposalConditionEntity = {
  id: string;
  proposalId: string;
  tenantId: string;
  title: string;
  content: string;
  order: number;
};

export type ProposalEntity = {
  id: string;
  tenantId: string;
  code: string;
  origin: string | null;
  status: ProposalStatus;
  createdBy: string;
  createdAt: string;
  closedAt: string | null;
};
