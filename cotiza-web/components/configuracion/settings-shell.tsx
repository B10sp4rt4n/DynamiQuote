"use client";

import { startTransition, useEffect, useState, type FormEvent } from "react";

import type { MarginPolicySummary } from "@/lib/db/margin-policies";
import type { ProposalStatusCounts, ProposalSummary } from "@/lib/db/proposals";
import type { QuoteDashboardSnapshot } from "@/lib/db/quotes";
import type { AppUserSummary, IssuerProfileSummary } from "@/lib/db/settings";
import type { ActiveTenantOption } from "@/lib/db/tenants";

type SettingsShellProps = {
  canViewControl?: boolean;
  canViewTenantConfig?: boolean;
  canManageAllTenants?: boolean;
  canManagePolicy?: boolean;
  issuerProfiles: IssuerProfileSummary[];
  marginPolicy: MarginPolicySummary;
  proposalMarginBlockedCount: number;
  proposalStatusCounts: ProposalStatusCounts;
  quoteDashboardSnapshot: QuoteDashboardSnapshot;
  recentProposals: ProposalSummary[];
  tenantId: string;
  tenantSlug: string;
  tenantOptions?: ActiveTenantOption[];
  tenantName: string;
  users: AppUserSummary[];
};

type Tab = "control" | "tenant" | "users" | "issuer" | "policy";

type TestEmailTemplate = "alta" | "mantenimiento" | "promocion";

type TestEmailHistoryItem = {
  createdAt: string;
  id: string;
  sent: boolean;
  subject: string | null;
  template: string;
  to: string;
  warning: string | null;
};

function templateLabel(template: string): string {
  if (template === "alta") return "Alta";
  if (template === "mantenimiento") return "Mantenimiento";
  if (template === "promocion") return "Promoción";
  return template;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(value));
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-MX", {
    currency: "MXN",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function MetricCard({
  helper,
  title,
  value,
}: {
  helper: string;
  title: string;
  value: number;
}) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">{title}</p>
      <p className="mt-2 text-3xl font-semibold text-zinc-900">{value}</p>
      <p className="mt-1 text-xs text-zinc-600">{helper}</p>
    </article>
  );
}

function statusPill(label: string, active: boolean) {
  return (
    <span
      className={`rounded-full px-2 py-1 text-xs font-medium ${
        active ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"
      }`}
    >
      {label}
    </span>
  );
}

function TenantConfigurationTab({
  issuerProfiles,
  marginPolicy,
  onOpenTab,
  onIssuerProfilesUpdated,
  onMarginPolicyUpdated,
  tenantId,
  tenantName,
  tenantSlug,
  users,
}: {
  issuerProfiles: IssuerProfileSummary[];
  marginPolicy: MarginPolicySummary;
  onOpenTab: (tab: Exclude<Tab, "control" | "tenant">) => void;
  onIssuerProfilesUpdated: (profiles: IssuerProfileSummary[]) => void;
  onMarginPolicyUpdated: (policy: MarginPolicySummary) => void;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  users: AppUserSummary[];
}) {
  const activeUsers = users.filter((user) => user.active);
  const ownerCount = activeUsers.filter((user) => user.role === "owner").length;
  const adminCount = activeUsers.filter((user) => user.role === "admin").length;
  const usersWithSellerCode = activeUsers.filter((user) => Boolean(user.sellerCode)).length;
  const defaultIssuer = issuerProfiles.find((profile) => profile.isDefault) ?? null;
  const fallbackIssuer = issuerProfiles.find((profile) => !profile.isDefault) ?? issuerProfiles[0] ?? null;
  const defaultIssuerReady = Boolean(defaultIssuer);
  const commercialReadiness = [
    ownerCount > 0,
    defaultIssuerReady,
    usersWithSellerCode === activeUsers.length || activeUsers.length === 0,
  ].filter(Boolean).length;
  const [quickActionPending, setQuickActionPending] = useState<"issuer" | "observer" | null>(null);
  const [quickActionError, setQuickActionError] = useState<string | null>(null);
  const [quickActionSuccess, setQuickActionSuccess] = useState<string | null>(null);

  async function toggleObserverApproval() {
    setQuickActionPending("observer");
    setQuickActionError(null);
    setQuickActionSuccess(null);

    try {
      const response = await fetch("/api/settings/margin-policy", {
        body: JSON.stringify({
          highPreapprovalMarginPct: marginPolicy.highPreapprovalMarginPct,
          maxMarginPct: marginPolicy.maxMarginPct,
          minMarginPct: marginPolicy.minMarginPct,
          requireObserverApproval: !marginPolicy.requireObserverApproval,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      });

      const data = (await response.json().catch(() => null)) as { error?: string; policy?: MarginPolicySummary } | null;
      if (!response.ok || !data?.policy) {
        throw new Error(data?.error ?? "No fue posible actualizar la política de margen");
      }

      onMarginPolicyUpdated(data.policy);
      setQuickActionSuccess(
        data.policy.requireObserverApproval
          ? "Se activó el observador adicional para la autorización final."
          : "Se desactivó el observador adicional para la autorización final.",
      );
    } catch (error) {
      setQuickActionError(error instanceof Error ? error.message : "Error interno al actualizar la política.");
    } finally {
      setQuickActionPending(null);
    }
  }

  async function assignFallbackIssuerAsDefault() {
    if (!fallbackIssuer) {
      return;
    }

    setQuickActionPending("issuer");
    setQuickActionError(null);
    setQuickActionSuccess(null);

    try {
      const response = await fetch(`/api/settings/issuer-profiles/${fallbackIssuer.logoId}`, {
        method: "PATCH",
      });

      const data = (await response.json().catch(() => null)) as { error?: string; profile?: IssuerProfileSummary } | null;
      if (!response.ok || !data?.profile) {
        throw new Error(data?.error ?? "No fue posible asignar el perfil emisor por default");
      }

      onIssuerProfilesUpdated(
        issuerProfiles.map((profile) => ({
          ...profile,
          isDefault: profile.logoId === data.profile?.logoId,
        })),
      );
      setQuickActionSuccess(`Se asignó ${data.profile.logoName} como perfil emisor por default.`);
    } catch (error) {
      setQuickActionError(error instanceof Error ? error.message : "Error interno al actualizar el perfil emisor.");
    } finally {
      setQuickActionPending(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Configuración del tenant</p>
        <h2 className="mt-2 text-2xl font-semibold text-zinc-900">Entorno operativo de {tenantName}</h2>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600">
          Aquí se concentra lo que define el comportamiento comercial y documental propio del tenant: márgenes,
          responsables, defaults de emisión y preparación operativa.
        </p>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <h3 className="text-lg font-semibold text-zinc-900">Identidad y alcance</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Tenant ID</p>
              <p className="mt-2 font-mono text-sm text-zinc-900">{tenantId}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Slug</p>
              <p className="mt-2 font-mono text-sm text-zinc-900">{tenantSlug}</p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <h3 className="text-lg font-semibold text-zinc-900">Preparación del entorno</h3>
          <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-sm text-zinc-600">Checklist comercial completado</p>
            <p className="mt-2 text-3xl font-semibold text-zinc-900">{commercialReadiness}/3</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {statusPill(ownerCount > 0 ? "Owner definido" : "Falta owner", ownerCount > 0)}
              {statusPill(defaultIssuerReady ? "Perfil default listo" : "Falta perfil default", defaultIssuerReady)}
              {statusPill(
                usersWithSellerCode === activeUsers.length || activeUsers.length === 0
                  ? "Códigos vendedor completos"
                  : "Faltan códigos vendedor",
                usersWithSellerCode === activeUsers.length || activeUsers.length === 0,
              )}
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-zinc-900">Parámetros comerciales</h3>
              <p className="text-sm text-zinc-600">Política que gobierna la liberación y aprobación de propuestas.</p>
            </div>
            <button
              className="rounded-lg bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-800 transition hover:bg-zinc-200"
              onClick={() => onOpenTab("policy")}
              type="button"
            >
              Editar política
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Margen mínimo</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-900">{marginPolicy.minMarginPct}%</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Margen máximo</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-900">{marginPolicy.maxMarginPct}%</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Preaprobación alta</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-900">{marginPolicy.highPreapprovalMarginPct}%</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Observador adicional</p>
              <p className="mt-2 text-sm font-medium text-zinc-900">
                {marginPolicy.requireObserverApproval ? "Requerido" : "No requerido"}
              </p>
              <p className="mt-1 text-xs text-zinc-600">Owner obligatorio siempre.</p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-zinc-900">Defaults operativos</h3>
              <p className="text-sm text-zinc-600">Valores base que impactan propuestas, PDFs y operación diaria.</p>
            </div>
            <div className="flex gap-2">
              <button
                className="rounded-lg bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-800 transition hover:bg-zinc-200"
                onClick={() => onOpenTab("issuer")}
                type="button"
              >
                Ver emisores
              </button>
              <button
                className="rounded-lg bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-800 transition hover:bg-zinc-200"
                onClick={() => onOpenTab("users")}
                type="button"
              >
                Ver usuarios
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Perfil emisor default</p>
              <p className="mt-2 font-medium text-zinc-900">{defaultIssuer?.logoName ?? "Pendiente de definir"}</p>
              <p className="mt-1 text-xs text-zinc-600">{defaultIssuer?.companyName ?? "No hay un emisor predeterminado activo."}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Owners activos</p>
                <p className="mt-2 text-2xl font-semibold text-zinc-900">{ownerCount}</p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Admins activos</p>
                <p className="mt-2 text-2xl font-semibold text-zinc-900">{adminCount}</p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Usuarios con código vendedor</p>
                <p className="mt-2 text-2xl font-semibold text-zinc-900">{usersWithSellerCode}/{activeUsers.length}</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900">Acciones rápidas</h3>
            <p className="text-sm text-zinc-600">Cambios operativos frecuentes sin salir de esta vista.</p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-sm font-semibold text-zinc-900">Observador adicional</p>
            <p className="mt-1 text-sm text-zinc-600">
              {marginPolicy.requireObserverApproval
                ? "Actualmente la autorización final exige observador adicional."
                : "Actualmente solo aplica la aprobación obligatoria de Owner."}
            </p>
            <button
              className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-60"
              disabled={quickActionPending !== null}
              onClick={toggleObserverApproval}
              type="button"
            >
              {quickActionPending === "observer"
                ? "Guardando..."
                : marginPolicy.requireObserverApproval
                  ? "Desactivar observador"
                  : "Activar observador"}
            </button>
          </article>

          <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-sm font-semibold text-zinc-900">Perfil emisor por default</p>
            <p className="mt-1 text-sm text-zinc-600">
              {defaultIssuerReady
                ? `Ya está definido ${defaultIssuer?.logoName} como perfil por default.`
                : fallbackIssuer
                  ? `Se puede asignar ${fallbackIssuer.logoName} como emisor por default en un clic.`
                  : "Aún no hay perfiles de emisor cargados para este tenant."}
            </p>
            <button
              className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-60"
              disabled={quickActionPending !== null || defaultIssuerReady || !fallbackIssuer}
              onClick={assignFallbackIssuerAsDefault}
              type="button"
            >
              {quickActionPending === "issuer" ? "Guardando..." : "Asignar default"}
            </button>
          </article>
        </div>

        {quickActionError ? <p className="mt-4 text-sm font-medium text-rose-800">{quickActionError}</p> : null}
        {quickActionSuccess ? <p className="mt-4 text-sm font-medium text-emerald-800">{quickActionSuccess}</p> : null}
      </section>
    </div>
  );
}

function ControlCenterTab({
  issuerProfiles,
  marginPolicy,
  onOpenTab,
  proposalMarginBlockedCount,
  proposalStatusCounts,
  quoteDashboardSnapshot,
  recentProposals,
  tenantName,
  users,
}: {
  issuerProfiles: IssuerProfileSummary[];
  marginPolicy: MarginPolicySummary;
  onOpenTab: (tab: Exclude<Tab, "control">) => void;
  proposalMarginBlockedCount: number;
  proposalStatusCounts: ProposalStatusCounts;
  quoteDashboardSnapshot: QuoteDashboardSnapshot;
  recentProposals: ProposalSummary[];
  tenantName: string;
  users: AppUserSummary[];
}) {
  const activeUsers = users.filter((user) => user.active).length;
  const ownerUsers = users.filter((user) => user.active && user.role === "owner").length;
  const defaultIssuerProfiles = issuerProfiles.filter((profile) => profile.isDefault).length;
  const missingSellerCodes = users.filter((user) => user.active && !user.sellerCode).length;
  const recentActivities = [
    ...quoteDashboardSnapshot.recentQuotes.map((quote) => ({
      href: `/cotizaciones?quoteId=${quote.quoteId}`,
      id: `quote:${quote.quoteId}`,
      label: quote.clientName,
      meta: quote.proposalName,
      timestamp: quote.createdAt,
      tone: "zinc",
      type: "Cotización",
    })),
    ...recentProposals.map((proposal) => ({
      href: `/propuestas?proposalId=${proposal.proposalId}`,
      id: `proposal:${proposal.proposalId}`,
      label: proposal.formal?.proposalNumber ?? proposal.proposalId,
      meta: proposal.formal?.recipientCompany ?? "Sin destinatario",
      timestamp: proposal.createdAt,
      tone: proposal.status === "approved" ? "emerald" : proposal.status === "sent" ? "blue" : "zinc",
      type: "Propuesta",
    })),
  ]
    .sort((left, right) => {
      const leftTime = left.timestamp ? new Date(left.timestamp).getTime() : 0;
      const rightTime = right.timestamp ? new Date(right.timestamp).getTime() : 0;
      return rightTime - leftTime;
    })
    .slice(0, 8);
  const usesDefaultPolicy =
    marginPolicy.createdAt === null &&
    marginPolicy.minMarginPct === 10 &&
    marginPolicy.maxMarginPct === 35 &&
    marginPolicy.highPreapprovalMarginPct === 55 &&
    marginPolicy.requireObserverApproval === false;

  const pendingItems = [
    ownerUsers === 0
      ? {
          action: "Definir un usuario Owner activo para el tenant.",
          cta: "Ir a usuarios",
          tab: "users" as const,
          tone: "rose",
        }
      : null,
    defaultIssuerProfiles === 0
      ? {
          action: "Seleccionar un perfil emisor por default para propuestas y PDFs.",
          cta: "Ir a perfiles",
          tab: "issuer" as const,
          tone: "amber",
        }
      : null,
    usesDefaultPolicy
      ? {
          action: "La política de margen sigue en valores por defecto; conviene personalizarla para este tenant.",
          cta: "Ir a política",
          tab: "policy" as const,
          tone: "amber",
        }
      : null,
    proposalMarginBlockedCount > 0
      ? {
          action: `Hay ${proposalMarginBlockedCount} propuesta(s) activas bloqueadas por márgenes fuera de política.`,
          cta: "Revisar política",
          tab: "policy" as const,
          tone: "rose",
        }
      : null,
    missingSellerCodes > 0
      ? {
          action: `Hay ${missingSellerCodes} usuario(s) activos sin código de vendedor, lo que puede afectar trazabilidad comercial.`,
          cta: "Completar usuarios",
          tab: "users" as const,
          tone: "amber",
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  const toneClasses: Record<string, string> = {
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    rose: "border-rose-200 bg-rose-50 text-rose-900",
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800 p-5 text-white shadow-sm">
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-300">Centro de control</p>
        <h2 className="mt-2 text-2xl font-semibold">Gobierno operativo de {tenantName}</h2>
        <p className="mt-2 max-w-3xl text-sm text-zinc-300">
          Este espacio concentra lo que depende de Owner o Superadmin para dejar el tenant listo: usuarios clave,
          política de márgenes, actividad comercial y pendientes de configuración.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard helper="Usuarios operando dentro del tenant" title="Usuarios activos" value={activeUsers} />
        <MetricCard helper="Cotizaciones vigentes registradas" title="Cotizaciones" value={quoteDashboardSnapshot.activeQuoteCount} />
        <MetricCard helper="Propuestas actualmente en borrador" title="Borradores" value={proposalStatusCounts.draft} />
        <MetricCard helper="Pendientes de revisión formal" title="En revisión" value={proposalStatusCounts.in_review} />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard helper="Monto agregado en cotizaciones" title="Ingreso cotizado" value={Math.round(quoteDashboardSnapshot.totalRevenue)} />
        <MetricCard helper="Propuestas ya aprobadas" title="Aprobadas" value={proposalStatusCounts.approved} />
        <MetricCard helper="Propuestas ya enviadas" title="Enviadas" value={proposalStatusCounts.sent} />
        <MetricCard helper="Fuera de política de margen" title="Bloqueadas" value={proposalMarginBlockedCount} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-zinc-900">Actividades pendientes</h3>
              <p className="text-sm text-zinc-600">Acciones que conviene cerrar para madurar el tenant.</p>
            </div>
            <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white">
              {pendingItems.length} pendiente(s)
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {pendingItems.length > 0 ? (
              pendingItems.map((item) => (
                <div key={item.action} className={`rounded-xl border p-4 ${toneClasses[item.tone]}`}>
                  <p className="text-sm font-medium">{item.action}</p>
                  <button
                    className="mt-3 rounded-lg bg-white/80 px-3 py-2 text-xs font-semibold text-zinc-900 transition hover:bg-white"
                    onClick={() => onOpenTab(item.tab)}
                    type="button"
                  >
                    {item.cta}
                  </button>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
                <p className="text-sm font-medium">No hay pendientes críticos de configuración.</p>
                <p className="mt-1 text-xs">
                  El tenant ya tiene owner, perfil emisor por default y política de márgenes ajustada.
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <h3 className="text-lg font-semibold text-zinc-900">Estado del entorno</h3>
          <div className="mt-4 space-y-3 text-sm text-zinc-700">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <p className="font-medium text-zinc-900">Política de margen</p>
              <p className="mt-1">Mínimo {marginPolicy.minMarginPct}% · Máximo {marginPolicy.maxMarginPct}%</p>
              <p>Preaprobación alta desde {marginPolicy.highPreapprovalMarginPct}%</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <p className="font-medium text-zinc-900">Gobierno comercial</p>
              <p className="mt-1">Owner activo(s): {ownerUsers}</p>
              <p>Observador adicional: {marginPolicy.requireObserverApproval ? "Activo" : "No requerido"}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <p className="font-medium text-zinc-900">Documentos emisores</p>
              <p className="mt-1">Perfiles cargados: {issuerProfiles.length}</p>
              <p>Perfil default: {defaultIssuerProfiles > 0 ? "Definido" : "Pendiente"}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <p className="font-medium text-zinc-900">Actividad comercial</p>
              <p className="mt-1">Aprobadas: {proposalStatusCounts.approved}</p>
              <p>Enviadas: {proposalStatusCounts.sent}</p>
              <p>Ingreso cotizado: {formatCurrency(quoteDashboardSnapshot.totalRevenue)}</p>
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900">Actividad reciente</h3>
            <p className="text-sm text-zinc-600">Últimas cotizaciones y propuestas del tenant.</p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto overflow-y-hidden rounded-xl border border-zinc-200">
          <table className="min-w-full divide-y divide-zinc-200 text-sm">
            <thead className="bg-zinc-50 text-left text-zinc-600">
              <tr>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Referencia</th>
                <th className="px-4 py-3 font-medium">Detalle</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 bg-white">
              {recentActivities.map((activity) => (
                <tr key={activity.id}>
                  <td className="px-4 py-3 text-zinc-700">{activity.type}</td>
                  <td className="px-4 py-3 font-medium text-zinc-900">{activity.label}</td>
                  <td className="px-4 py-3 text-zinc-600">{activity.meta}</td>
                  <td className="px-4 py-3 text-zinc-600">
                    {activity.timestamp ? formatDate(activity.timestamp) : "Sin fecha"}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      className="rounded-lg bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-800 transition hover:bg-zinc-200"
                      href={activity.href}
                    >
                      Abrir
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {recentActivities.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">Aún no hay actividad reciente para mostrar.</p>
        ) : null}
      </section>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    admin: "bg-violet-100 text-violet-900",
    user: "bg-zinc-200 text-zinc-900",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[role] ?? "bg-zinc-100 text-zinc-700"}`}
    >
      {role}
    </span>
  );
}

function UsersTab({
  canManageAllTenants = false,
  onUserDeleted,
  onUserUpdated,
  tenantOptions,
  users,
}: {
  canManageAllTenants?: boolean;
  onUserDeleted: (userId: string) => void;
  onUserUpdated: (user: AppUserSummary) => void;
  tenantOptions: ActiveTenantOption[];
  users: AppUserSummary[];
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editAlias, setEditAlias] = useState("");
  const [editRole, setEditRole] = useState<"user" | "admin" | "owner">("user");
  const [editSellerCode, setEditSellerCode] = useState("");
  const [editTenantId, setEditTenantId] = useState(tenantOptions[0]?.id ?? "");

  async function toggleActive(userId: string) {
    setPending(userId);
    setError(null);
    try {
      const res = await fetch(`/api/settings/users/${userId}`, { method: "PATCH" });
      const data = (await res.json()) as { error?: string; user?: AppUserSummary };
      if (!res.ok || !data.user) throw new Error(data.error ?? "Error al actualizar usuario");
      onUserUpdated(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setPending(null);
    }
  }

  function beginEdit(user: AppUserSummary) {
    setError(null);
    setEditingUserId(user.userId);
    setEditFirstName(user.firstName);
    setEditLastName(user.lastName);
    setEditAlias(user.alias);
    setEditRole((user.role === "admin" || user.role === "owner" ? user.role : "user") as "user" | "admin" | "owner");
    setEditSellerCode(user.sellerCode ?? "");
    setEditTenantId(user.tenantId ?? tenantOptions[0]?.id ?? "");
  }

  function cancelEdit() {
    setEditingUserId(null);
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingUserId) return;

    setPending(`edit:${editingUserId}`);
    setError(null);

    try {
      const payload = {
        alias: editAlias,
        firstName: editFirstName,
        lastName: editLastName,
        role: editRole,
        sellerCode: editSellerCode || null,
        tenantId: canManageAllTenants ? editTenantId : undefined,
      };

      const res = await fetch(`/api/settings/users/${editingUserId}`, {
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });

      const data = (await res.json()) as { error?: string; user?: AppUserSummary };
      if (!res.ok || !data.user) throw new Error(data.error ?? "No se pudo editar el usuario");

      onUserUpdated(data.user);
      setEditingUserId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setPending(null);
    }
  }

  async function resendAccess(user: AppUserSummary) {
    setPending(`resend:${user.userId}`);
    setError(null);
    setResendSuccess(null);

    try {
      const res = await fetch(`/api/settings/users/${user.userId}/resend-access`, {
        method: "POST",
      });
      const data = (await res.json()) as { error?: string; ok?: boolean };

      if (!res.ok) {
        throw new Error(data.error ?? "No se pudo reenviar el acceso. Revisa la configuración o intenta nuevamente.");
      }

      setResendSuccess(`Acceso reenviado correctamente a ${user.firstName} ${user.lastName}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setPending(null);
    }
  }

  async function deleteUser(user: AppUserSummary) {
    if (!confirm(`Se eliminará definitivamente a ${user.firstName} ${user.lastName}. ¿Continuar?`)) {
      return;
    }

    setPending(`delete:${user.userId}`);
    setError(null);

    try {
      const res = await fetch(`/api/settings/users/${user.userId}`, { method: "DELETE" });
      const data = (await res.json()) as { deleted?: boolean; error?: string };

      if (!res.ok || !data.deleted) throw new Error(data.error ?? "No se pudo borrar el usuario");
      onUserDeleted(user.userId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm font-medium text-rose-800">{error}</p> : null}
      {resendSuccess ? (
        <p className="text-sm font-medium text-emerald-700">{resendSuccess}</p>
      ) : null}

      {canManageAllTenants && editingUserId ? (
        <form className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4" onSubmit={submitEdit}>
          <p className="text-sm font-semibold text-zinc-900">Editar usuario</p>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500"
              onChange={(event) => setEditFirstName(event.target.value)}
              placeholder="Nombre"
              required
              value={editFirstName}
            />
            <input
              className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500"
              onChange={(event) => setEditLastName(event.target.value)}
              placeholder="Apellidos"
              required
              value={editLastName}
            />
            <input
              className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500"
              onChange={(event) => setEditAlias(event.target.value)}
              placeholder="Alias"
              required
              value={editAlias}
            />
            <select
              className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm text-zinc-900"
              onChange={(event) => setEditRole(event.target.value as "user" | "admin" | "owner")}
              value={editRole}
            >
              <option value="user">Usuario estándar</option>
              <option value="admin">Administrador</option>
              <option value="owner">Owner</option>
            </select>
            <input
              className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500"
              onChange={(event) => setEditSellerCode(event.target.value)}
              placeholder="Código vendedor"
              value={editSellerCode}
            />
            <select
              className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm text-zinc-900"
              onChange={(event) => setEditTenantId(event.target.value)}
              required
              value={editTenantId}
            >
              {tenantOptions.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-60"
              disabled={pending === `edit:${editingUserId}`}
              type="submit"
            >
              {pending === `edit:${editingUserId}` ? "Guardando..." : "Guardar cambios"}
            </button>
            <button
              className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-200"
              onClick={cancelEdit}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      <div className="overflow-x-auto overflow-y-hidden rounded-xl border border-zinc-200">
        <table className="min-w-[1200px] divide-y divide-zinc-200 text-sm">
          <thead className="bg-zinc-50 text-left text-zinc-600">
            <tr>
              {canManageAllTenants ? <th className="px-4 py-3 font-medium">Empresa</th> : null}
              <th className="px-4 py-3 font-medium">Usuario</th>
              <th className="px-4 py-3 font-medium">Correo</th>
              <th className="px-4 py-3 font-medium">Alias</th>
              <th className="px-4 py-3 font-medium">Rol</th>
              <th className="px-4 py-3 font-medium">Subtenant</th>
              <th className="px-4 py-3 font-medium">Código vendedor</th>
              <th className="px-4 py-3 font-medium">Alta</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              {canManageAllTenants ? <th className="px-4 py-3 font-medium">Acciones</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 bg-white">
            {users.map((user) => (
              <tr key={user.userId} className={user.active ? "" : "opacity-50"}>
                {canManageAllTenants ? (
                  <td className="px-4 py-3 text-zinc-500">{user.tenantName ?? "Sin empresa"}</td>
                ) : null}
                <td className="px-4 py-3 text-zinc-900">
                  {user.firstName} {user.lastName}
                </td>
                <td className="px-4 py-3 text-zinc-500">
                  {user.email ? (
                    <a
                      className="hover:underline"
                      href={`mailto:${user.email}`}
                    >
                      {user.email}
                    </a>
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-600">{user.alias}</td>
                <td className="px-4 py-3">
                  <RoleBadge role={user.role} />
                </td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-500">{user.subtenantKey}</td>
                <td className="px-4 py-3 text-zinc-500">{user.sellerCode ?? "—"}</td>
                <td className="px-4 py-3 text-zinc-500">{formatDate(user.createdAt)}</td>
                <td className="px-4 py-3">
                  <button
                    className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                      user.active
                        ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                    } disabled:cursor-not-allowed`}
                    disabled={pending === user.userId}
                    onClick={() => toggleActive(user.userId)}
                    type="button"
                  >
                    {pending === user.userId ? "..." : user.active ? "Activo" : "Inactivo"}
                  </button>
                </td>
                {canManageAllTenants ? (
                  <td className="px-4 py-3 whitespace-nowrap">
                    {user.role.toLowerCase().includes("superadmin") ? (
                      <div className="flex gap-2 whitespace-nowrap pr-2">
                        <span className="text-xs font-medium text-zinc-600">Protegido</span>
                        <button
                          className="rounded-lg bg-sky-100 px-3 py-1 text-xs font-medium text-sky-700 transition hover:bg-sky-200 disabled:opacity-60"
                          disabled={pending === `resend:${user.userId}`}
                          onClick={() => void resendAccess(user)}
                          type="button"
                        >
                          {pending === `resend:${user.userId}` ? "..." : "Reenviar acceso"}
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2 whitespace-nowrap pr-2">
                        <button
                          className="rounded-lg bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-200"
                          onClick={() => beginEdit(user)}
                          type="button"
                        >
                          Editar
                        </button>
                        <button
                          className="rounded-lg bg-sky-100 px-3 py-1 text-xs font-medium text-sky-700 transition hover:bg-sky-200 disabled:opacity-60"
                          disabled={pending === `resend:${user.userId}`}
                          onClick={() => void resendAccess(user)}
                          type="button"
                        >
                          {pending === `resend:${user.userId}` ? "..." : "Reenviar acceso"}
                        </button>
                        <button
                          className="rounded-lg bg-rose-100 px-3 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-200 disabled:opacity-60"
                          disabled={pending === `delete:${user.userId}`}
                          onClick={() => void deleteUser(user)}
                          type="button"
                        >
                          {pending === `delete:${user.userId}` ? "..." : "Borrar"}
                        </button>
                      </div>
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {users.length === 0 && (
        <p className="text-sm text-zinc-500">No hay usuarios para este tenant.</p>
      )}
    </div>
  );
}

function CreateUserForm({
  onCreated,
  tenantOptions,
}: {
  onCreated: (user: AppUserSummary) => void;
  tenantOptions: ActiveTenantOption[];
}) {
  const [alias, setAlias] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [sellerCode, setSellerCode] = useState("");
  const [role, setRole] = useState<"user" | "admin" | "owner">("user");
  const [tenantId, setTenantId] = useState(tenantOptions[0]?.id ?? "");
  const [userId, setUserId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const canSelectTenant = tenantOptions.length > 0;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setPending(true);

    try {
      const payload = {
        alias,
        email,
        firstName,
        lastName,
        role,
        sellerCode: sellerCode || null,
        tenantId: canSelectTenant ? tenantId : undefined,
        userId: userId.trim() || undefined,
      };

      const res = await fetch("/api/settings/users", {
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      const data = (await res.json()) as {
        error?: string;
        user?: AppUserSummary;
        clerkSynced?: boolean;
        clerkWarning?: string | null;
        emailSent?: boolean;
        emailWarning?: string | null;
        invitationSent?: boolean;
      };

      if (!res.ok || !data.user) {
        throw new Error(data.error ?? "No fue posible crear el usuario");
      }

      onCreated(data.user);
      setAlias("");
      setEmail("");
      setFirstName("");
      setLastName("");
      setSellerCode("");
      setUserId("");
      setRole("user");
      setSuccess(
        data.emailSent
          ? data.clerkWarning
            ? `Usuario creado. Invitación enviada a ${email}. Nota: ${data.clerkWarning}`
            : `Usuario creado. Invitación enviada a ${email}.`
          : data.clerkSynced
            ? "Usuario creado y vinculado a Clerk correctamente."
            : data.emailWarning ?? data.clerkWarning ?? "Usuario creado, pero no se pudo enviar invitación por correo.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4" onSubmit={onSubmit}>
      <p className="text-sm font-semibold text-zinc-900">Nuevo usuario</p>
      <div className="grid gap-3 md:grid-cols-2">
        <input
          className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500"
          onChange={(event) => setFirstName(event.target.value)}
          placeholder="Nombre *"
          required
          value={firstName}
        />
        <input
          className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500"
          onChange={(event) => setLastName(event.target.value)}
          placeholder="Apellidos *"
          required
          value={lastName}
        />
        <input
          className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500"
          onChange={(event) => setAlias(event.target.value)}
          placeholder="Alias (ej. j.perez) *"
          required
          value={alias}
        />
        <input
          className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Correo del usuario *"
          required
          type="email"
          value={email}
        />
        <select
          className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm text-zinc-900"
          onChange={(event) => setRole(event.target.value as "user" | "admin" | "owner")}
          value={role}
        >
          <option value="user">Usuario estándar</option>
          <option value="admin">Administrador</option>
          <option value="owner">Owner</option>
        </select>
        <input
          className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500"
          onChange={(event) => setSellerCode(event.target.value)}
          placeholder="Código vendedor (opcional)"
          value={sellerCode}
        />
        <input
          className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500"
          onChange={(event) => setUserId(event.target.value)}
          placeholder="ID interno/admin (opcional)"
          value={userId}
        />
        {canSelectTenant ? (
          <select
            className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm text-zinc-900 md:col-span-2"
            onChange={(event) => setTenantId(event.target.value)}
            required
            value={tenantId}
          >
            {tenantOptions.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      {error ? <p className="text-xs font-medium text-rose-800">{error}</p> : null}
      {success ? <p className="text-xs font-medium text-emerald-800">{success}</p> : null}
      <div>
        <button
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending ? "Creando..." : "Crear usuario"}
        </button>
      </div>
    </form>
  );
}

function TestEmailForm({ tenantName }: { tenantName: string }) {
  const [to, setTo] = useState("");
  const [template, setTemplate] = useState<TestEmailTemplate>("alta");
  const [customSubject, setCustomSubject] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [historyFilterTemplate, setHistoryFilterTemplate] = useState<"all" | TestEmailTemplate>("all");
  const [historyFilterStatus, setHistoryFilterStatus] = useState<"all" | "sent" | "failed">("all");
  const [historySearchTo, setHistorySearchTo] = useState("");
  const [pending, setPending] = useState(false);
  const [historyPending, setHistoryPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<TestEmailHistoryItem[]>([]);
  const [success, setSuccess] = useState<string | null>(null);

  const filteredHistory = history.filter((item) => {
    if (historyFilterTemplate !== "all" && item.template !== historyFilterTemplate) {
      return false;
    }

    if (historyFilterStatus === "sent" && !item.sent) {
      return false;
    }

    if (historyFilterStatus === "failed" && item.sent) {
      return false;
    }

    if (historySearchTo.trim().length > 0 && !item.to.toLowerCase().includes(historySearchTo.trim().toLowerCase())) {
      return false;
    }

    return true;
  });

  async function loadHistory() {
    setHistoryPending(true);
    setError(null);

    try {
      const res = await fetch("/api/settings/test-email", { method: "GET" });
      const data = (await res.json()) as { error?: string; history?: TestEmailHistoryItem[] };

      if (!res.ok) {
        throw new Error(data.error ?? "No se pudo cargar el historial");
      }

      setHistory(data.history ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setHistoryPending(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setPending(true);

    try {
      const res = await fetch("/api/settings/test-email", {
        body: JSON.stringify({
          customMessage: customMessage.trim() || undefined,
          customSubject: customSubject.trim() || undefined,
          template,
          to,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      const data = (await res.json()) as {
        error?: string;
        history?: TestEmailHistoryItem[];
        sent?: boolean;
        warning?: string | null;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "No se pudo enviar el correo de prueba");
      }

      if (data.history) {
        setHistory(data.history);
      }

      if (data.sent) {
        setSuccess(`Correo de prueba enviado a ${to}.`);
      } else {
        setError(data.warning ?? "No se pudo enviar el correo de prueba.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4" onSubmit={onSubmit}>
      <p className="text-sm font-semibold text-zinc-900">Correo de pruebas</p>
      <p className="text-xs text-zinc-600">
        Envía mensajes de alta, mantenimiento o promoción para validar plantillas de {tenantName}.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <input
          className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500"
          onChange={(event) => setTo(event.target.value)}
          placeholder="Correo destino *"
          required
          type="email"
          value={to}
        />
        <select
          className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm text-zinc-900"
          onChange={(event) => setTemplate(event.target.value as TestEmailTemplate)}
          value={template}
        >
          <option value="alta">Alta de usuario</option>
          <option value="mantenimiento">Mantenimiento</option>
          <option value="promocion">Promoción</option>
        </select>
        <input
          className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500 md:col-span-2"
          onChange={(event) => setCustomSubject(event.target.value)}
          placeholder="Asunto personalizado (opcional)"
          value={customSubject}
        />
        <textarea
          className="min-h-24 rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500 md:col-span-2"
          onChange={(event) => setCustomMessage(event.target.value)}
          placeholder="Mensaje personalizado (opcional)"
          value={customMessage}
        />
      </div>

      {error ? <p className="text-xs font-medium text-rose-800">{error}</p> : null}
      {success ? <p className="text-xs font-medium text-emerald-800">{success}</p> : null}

      <div>
        <button
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending ? "Enviando..." : "Enviar correo de prueba"}
        </button>
        <button
          className="ml-2 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-200 disabled:opacity-60"
          disabled={historyPending}
          onClick={loadHistory}
          type="button"
        >
          {historyPending ? "Actualizando..." : "Actualizar historial"}
        </button>
      </div>

      <div className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-100/60 p-3 md:grid-cols-3">
        <select
          className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm text-zinc-900"
          onChange={(event) => setHistoryFilterTemplate(event.target.value as "all" | TestEmailTemplate)}
          value={historyFilterTemplate}
        >
          <option value="all">Tipo: todos</option>
          <option value="alta">Tipo: alta</option>
          <option value="mantenimiento">Tipo: mantenimiento</option>
          <option value="promocion">Tipo: promoción</option>
        </select>

        <select
          className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm text-zinc-900"
          onChange={(event) => setHistoryFilterStatus(event.target.value as "all" | "sent" | "failed")}
          value={historyFilterStatus}
        >
          <option value="all">Estatus: todos</option>
          <option value="sent">Estatus: enviados</option>
          <option value="failed">Estatus: fallidos</option>
        </select>

        <input
          className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500"
          onChange={(event) => setHistorySearchTo(event.target.value)}
          placeholder="Buscar por correo destino"
          value={historySearchTo}
        />
      </div>

      <div className="overflow-x-auto overflow-y-hidden rounded-xl border border-zinc-200 bg-white">
        <table className="min-w-[900px] divide-y divide-zinc-200 text-sm">
          <thead className="bg-zinc-50 text-left text-zinc-700">
            <tr>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Destino</th>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 font-medium">Asunto</th>
              <th className="px-4 py-3 font-medium">Estatus</th>
              <th className="px-4 py-3 font-medium">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 bg-white">
            {filteredHistory.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-3 text-zinc-700">{formatDate(item.createdAt)}</td>
                <td className="px-4 py-3 text-zinc-900">{item.to}</td>
                <td className="px-4 py-3 text-zinc-700">{templateLabel(item.template)}</td>
                <td className="px-4 py-3 text-zinc-700">{item.subject ?? "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      item.sent ? "bg-emerald-100 text-emerald-900" : "bg-rose-100 text-rose-900"
                    }`}
                  >
                    {item.sent ? "Enviado" : "Falló"}
                  </span>
                </td>
                <td className="px-4 py-3 text-zinc-600">{item.warning ?? "Sin errores"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {history.length === 0 ? <p className="text-xs text-zinc-600">Aún no hay correos de prueba registrados.</p> : null}
      {history.length > 0 && filteredHistory.length === 0 ? (
        <p className="text-xs text-zinc-600">No hay resultados con los filtros actuales.</p>
      ) : null}
    </form>
  );
}

function MarginPolicyTab({
  canManagePolicy = false,
  initial,
  onPolicyUpdated,
}: {
  canManagePolicy?: boolean;
  initial: MarginPolicySummary;
  onPolicyUpdated?: (policy: MarginPolicySummary) => void;
}) {
  const [minMarginPct, setMinMarginPct] = useState(String(initial.minMarginPct));
  const [maxMarginPct, setMaxMarginPct] = useState(String(initial.maxMarginPct));
  const [highPreapprovalMarginPct, setHighPreapprovalMarginPct] = useState(String(initial.highPreapprovalMarginPct));
  const [requireObserverApproval, setRequireObserverApproval] = useState(initial.requireObserverApproval);
  const [policy, setPolicy] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    startTransition(() => {
      setMinMarginPct(String(initial.minMarginPct));
      setMaxMarginPct(String(initial.maxMarginPct));
      setHighPreapprovalMarginPct(String(initial.highPreapprovalMarginPct));
      setRequireObserverApproval(initial.requireObserverApproval);
      setPolicy(initial);
    });
  }, [initial]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManagePolicy) {
      setError("No tienes permisos para editar la politica de margen.");
      return;
    }

    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        highPreapprovalMarginPct: Number(highPreapprovalMarginPct),
        maxMarginPct: Number(maxMarginPct),
        minMarginPct: Number(minMarginPct),
        requireObserverApproval,
      };

      const res = await fetch("/api/settings/margin-policy", {
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      });

      const data = (await res.json()) as { error?: string; policy?: MarginPolicySummary };

      if (!res.ok || !data.policy) {
        throw new Error(data.error ?? "No se pudo actualizar la politica de margen");
      }

      setPolicy(data.policy);
  onPolicyUpdated?.(data.policy);
      setSuccess("Politica de margen guardada correctamente.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="grid gap-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4" onSubmit={onSubmit}>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-zinc-900">Politica de margen del tenant</p>
        <p className="text-xs text-zinc-600">
          Define el rango de liberacion y el umbral alto para preaprobacion informativa.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm text-zinc-700">
          Margen minimo permitido
          <input
            className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm text-zinc-900"
            disabled={!canManagePolicy}
            max={99.99}
            min={0}
            onChange={(event) => setMinMarginPct(event.target.value)}
            step={0.01}
            type="number"
            value={minMarginPct}
          />
        </label>
        <label className="grid gap-1 text-sm text-zinc-700">
          Margen maximo permitido
          <input
            className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm text-zinc-900"
            disabled={!canManagePolicy}
            max={99.99}
            min={0}
            onChange={(event) => setMaxMarginPct(event.target.value)}
            step={0.01}
            type="number"
            value={maxMarginPct}
          />
        </label>
        <label className="grid gap-1 text-sm text-zinc-700">
          Umbral alto para preaprobacion informativa
          <input
            className="rounded-lg border border-zinc-400 bg-white px-3 py-2 text-sm text-zinc-900"
            disabled={!canManagePolicy}
            max={99.99}
            min={0}
            onChange={(event) => setHighPreapprovalMarginPct(event.target.value)}
            step={0.01}
            type="number"
            value={highPreapprovalMarginPct}
          />
        </label>
        <label className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700">
          <input
            checked={requireObserverApproval}
            disabled={!canManagePolicy}
            onChange={(event) => setRequireObserverApproval(event.target.checked)}
            type="checkbox"
          />
          Requerir observador adicional para autorizacion final
        </label>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white px-3 py-3 text-xs text-zinc-600">
        <p className="font-medium text-zinc-800">Owner obligatorio siempre</p>
        <p>
          El sistema fuerza la aprobacion de Owner para autorizar propuestas. Este control no es editable desde la UI.
        </p>
      </div>

      <div className="grid gap-2 text-xs text-zinc-600 md:grid-cols-2">
        <div>
          <span className="font-medium text-zinc-800">Tenant:</span> {policy.tenantId}
        </div>
        <div>
          <span className="font-medium text-zinc-800">Actualizado:</span>{" "}
          {policy.updatedAt ? formatDate(policy.updatedAt) : "Sin cambios guardados"}
        </div>
      </div>

      {error ? <p className="text-xs font-medium text-rose-800">{error}</p> : null}
      {success ? <p className="text-xs font-medium text-emerald-800">{success}</p> : null}

      <div>
        <button
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-60"
          disabled={!canManagePolicy || pending}
          type="submit"
        >
          {pending ? "Guardando..." : "Guardar politica"}
        </button>
      </div>
    </form>
  );
}

function IssuerProfilesTab({
  issuerProfiles: initial,
  onProfilesUpdated,
}: {
  issuerProfiles: IssuerProfileSummary[];
  onProfilesUpdated?: (profiles: IssuerProfileSummary[]) => void;
}) {
  const [profiles, setProfiles] = useState(initial);
  const [companyName, setCompanyName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoName, setLogoName] = useState("");
  const [logoType, setLogoType] = useState<"issuer" | "client">("issuer");
  const [pending, setPending] = useState<string | null>(null);
  const [uploadPending, setUploadPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    startTransition(() => {
      setProfiles(initial);
    });
  }, [initial]);

  async function setDefault(logoId: string) {
    setPending(logoId);
    setError(null);
    try {
      const res = await fetch(`/api/settings/issuer-profiles/${logoId}`, { method: "PATCH" });
      const data = (await res.json()) as { error?: string; profile?: IssuerProfileSummary };
      if (!res.ok || !data.profile) throw new Error(data.error ?? "Error al actualizar perfil");
      setProfiles((prev) => {
        const next = prev.map((p) => ({
          ...p,
          isDefault: p.logoId === logoId,
        }));
        onProfilesUpdated?.(next);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setPending(null);
    }
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!logoFile) {
      setError("Selecciona un archivo de logo.");
      return;
    }

    setUploadPending(true);
    setError(null);
    try {
      const payload = new FormData();
      payload.append("logoType", logoType);
      payload.append("logoFile", logoFile);
      payload.append("logoName", logoName.trim() || logoFile.name);
      payload.append("companyName", companyName.trim());
      payload.append("isDefault", isDefault ? "true" : "false");

      const res = await fetch("/api/settings/issuer-profiles", {
        body: payload,
        method: "POST",
      });

      const data = (await res.json()) as { error?: string; profile?: IssuerProfileSummary };
      if (!res.ok || !data.profile) {
        throw new Error(data.error ?? "No se pudo cargar el logo");
      }

      setProfiles((prev) => {
        const next = [
          data.profile!,
          ...prev.map((profile) => {
            if (logoType === "issuer" && data.profile?.isDefault && profile.logoType === "issuer") {
              return { ...profile, isDefault: false };
            }

            return profile;
          }),
        ];
        onProfilesUpdated?.(next);
        return next;
      });

      setLogoFile(null);
      setLogoName("");
      setCompanyName("");
      setIsDefault(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setUploadPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <form className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 md:grid-cols-2" onSubmit={(event) => { void handleUpload(event); }}>
        <label className="text-sm text-zinc-700">
          Tipo de logo
          <select
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            onChange={(event) => setLogoType(event.target.value as "issuer" | "client")}
            value={logoType}
          >
            <option value="issuer">Proveedor</option>
            <option value="client">Cliente</option>
          </select>
        </label>

        <label className="text-sm text-zinc-700">
          Nombre del logo
          <input
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            onChange={(event) => setLogoName(event.target.value)}
            placeholder="Ej. Logotipo corporativo"
            value={logoName}
          />
        </label>

        <label className="text-sm text-zinc-700">
          Empresa
          <input
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            onChange={(event) => setCompanyName(event.target.value)}
            placeholder="Nombre comercial"
            value={companyName}
          />
        </label>

        <label className="text-sm text-zinc-700">
          Archivo
          <input
            accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
            className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
            type="file"
          />
        </label>

        <label className="inline-flex items-center gap-2 text-sm text-zinc-700 md:col-span-2">
          <input
            checked={isDefault}
            disabled={logoType !== "issuer"}
            onChange={(event) => setIsDefault(event.target.checked)}
            type="checkbox"
          />
          Marcar como default del proveedor
        </label>

        <div className="md:col-span-2">
          <button
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-60"
            disabled={uploadPending}
            type="submit"
          >
            {uploadPending ? "Subiendo..." : "Agregar logo"}
          </button>
        </div>
      </form>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      <div className="overflow-hidden rounded-xl border border-zinc-200">
        <table className="min-w-full divide-y divide-zinc-200 text-sm">
          <thead className="bg-zinc-50 text-left text-zinc-600">
            <tr>
              <th className="px-4 py-3 font-medium">Vista previa</th>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Empresa</th>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 font-medium">Formato</th>
              <th className="px-4 py-3 font-medium">Subido</th>
              <th className="px-4 py-3 font-medium">Default</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 bg-white">
            {profiles.map((profile) => (
              <tr key={profile.logoId} className={profile.isDefault ? "bg-emerald-50/50" : ""}>
                <td className="px-4 py-3">
                  <div className="flex h-10 w-28 items-center justify-center overflow-hidden rounded-md border border-zinc-200 bg-white">
                    <img
                      alt={profile.logoName}
                      className="h-full w-full object-contain"
                      loading="lazy"
                      src={`/api/settings/issuer-profiles/${profile.logoId}`}
                    />
                  </div>
                </td>
                <td className="px-4 py-3 text-zinc-900">{profile.logoName}</td>
                <td className="px-4 py-3 text-zinc-600">{profile.companyName ?? "—"}</td>
                <td className="px-4 py-3 text-zinc-500">{profile.logoType}</td>
                <td className="px-4 py-3 font-mono text-xs uppercase text-zinc-500">
                  {profile.logoFormat}
                </td>
                <td className="px-4 py-3 text-zinc-500">{formatDate(profile.uploadedAt)}</td>
                <td className="px-4 py-3">
                  {profile.logoType !== "issuer" ? (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                      N/A
                    </span>
                  ) : profile.isDefault ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                      Default
                    </span>
                  ) : (
                    <button
                      className="rounded-lg bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-200 disabled:cursor-not-allowed"
                      disabled={pending === profile.logoId}
                      onClick={() => setDefault(profile.logoId)}
                      type="button"
                    >
                      {pending === profile.logoId ? "..." : "Usar como default"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {profiles.length === 0 && (
        <p className="text-sm text-zinc-500">No hay perfiles de emisor para este tenant.</p>
      )}
    </div>
  );
}

export function SettingsShell({
  users,
  issuerProfiles,
  marginPolicy,
  proposalStatusCounts,
  proposalMarginBlockedCount,
  quoteDashboardSnapshot,
  recentProposals,
  tenantName,
  canViewControl = false,
  canViewTenantConfig = false,
  canManageAllTenants = false,
  canManagePolicy = false,
  tenantId,
  tenantSlug,
  tenantOptions = [],
}: SettingsShellProps) {
  const [tab, setTab] = useState<Tab>(canViewControl ? "control" : "users");
  const [usersState, setUsersState] = useState(users);
  const [issuerProfilesState, setIssuerProfilesState] = useState(issuerProfiles);
  const [marginPolicyState, setMarginPolicyState] = useState(marginPolicy);

  function pushUser(user: AppUserSummary) {
    setUsersState((prev) => [user, ...prev]);
  }

  const tabClass = (t: Tab) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition ${
      tab === t
        ? "border-zinc-900 text-zinc-900"
        : "border-transparent text-zinc-500 hover:text-zinc-700"
    }`;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2 border-b border-zinc-200 pb-4">
        <p className="text-sm uppercase tracking-[0.18em] text-zinc-500">Tenant activo</p>
        <h1 className="text-2xl font-semibold text-zinc-900">Configuración de {tenantName}</h1>
      </div>

      <div className="mt-4 flex gap-0 border-b border-zinc-200">
        {canViewControl ? (
          <button className={tabClass("control")} onClick={() => setTab("control")} type="button">
            Control
          </button>
        ) : null}
        {canViewTenantConfig ? (
          <button className={tabClass("tenant")} onClick={() => setTab("tenant")} type="button">
            Tenant
          </button>
        ) : null}
        <button className={tabClass("users")} onClick={() => setTab("users")} type="button">
          Usuarios ({usersState.length})
        </button>
        <button className={tabClass("policy")} onClick={() => setTab("policy")} type="button">
          Política margen
        </button>
        <button className={tabClass("issuer")} onClick={() => setTab("issuer")} type="button">
          Perfiles emisor ({issuerProfiles.length})
        </button>
        <a
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
          href="/configuracion/clientes"
        >
          Clientes
        </a>
      </div>

      <div className="mt-5">
        {tab === "control" && canViewControl && (
          <ControlCenterTab
            issuerProfiles={issuerProfilesState}
            marginPolicy={marginPolicyState}
            onOpenTab={(nextTab) => setTab(nextTab)}
            proposalMarginBlockedCount={proposalMarginBlockedCount}
            proposalStatusCounts={proposalStatusCounts}
            quoteDashboardSnapshot={quoteDashboardSnapshot}
            recentProposals={recentProposals}
            tenantName={tenantName}
            users={usersState}
          />
        )}
        {tab === "tenant" && canViewTenantConfig && (
          <TenantConfigurationTab
            issuerProfiles={issuerProfilesState}
            marginPolicy={marginPolicyState}
            onOpenTab={(nextTab) => setTab(nextTab)}
            onIssuerProfilesUpdated={setIssuerProfilesState}
            onMarginPolicyUpdated={setMarginPolicyState}
            tenantId={tenantId}
            tenantName={tenantName}
            tenantSlug={tenantSlug}
            users={usersState}
          />
        )}
        {tab === "users" && (
          <div className="space-y-4">
            <CreateUserForm
              onCreated={pushUser}
              tenantOptions={tenantOptions}
            />
            {canManageAllTenants ? <TestEmailForm tenantName={tenantName} /> : null}
            <UsersTab
              canManageAllTenants={canManageAllTenants}
              onUserDeleted={(userId) => {
                setUsersState((prev) => prev.filter((user) => user.userId !== userId));
              }}
              onUserUpdated={(updated) => {
                setUsersState((prev) => prev.map((user) => (user.userId === updated.userId ? updated : user)));
              }}
              tenantOptions={tenantOptions}
              users={usersState}
            />
          </div>
        )}
        {tab === "policy" && (
          <MarginPolicyTab
            canManagePolicy={canManagePolicy}
            initial={marginPolicyState}
            onPolicyUpdated={setMarginPolicyState}
          />
        )}
        {tab === "issuer" && (
          <IssuerProfilesTab issuerProfiles={issuerProfilesState} onProfilesUpdated={setIssuerProfilesState} />
        )}
      </div>
    </section>
  );
}
