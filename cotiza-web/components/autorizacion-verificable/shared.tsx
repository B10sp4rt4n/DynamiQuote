import type { ApprovalSnapshot } from "@/lib/domain/verified-authorization";

export const control = "min-h-11 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-50";
export const primary = `${control} border-zinc-900 bg-zinc-900 text-white`;
export function localTime(value: string) {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(value));
}
export async function approvalFetch<T>(path: string, tenantId?: string, body?: unknown, token?: string): Promise<T> {
  const response = await fetch(`/api/verified-authorization/${path}`, { method: body === undefined ? "GET" : "POST", cache: "no-store", credentials: "same-origin",
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json", "X-Approval-Tenant": tenantId ?? "" }), ...(token ? { "X-Approval-Token": token } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "No fue posible completar la solicitud");
  return result as T;
}
export function SnapshotCard({ value, hash }: { value: unknown; hash: string }) {
  const snapshot = value as ApprovalSnapshot;
  const input = snapshot.input;
  return <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
    <p className="font-semibold">{snapshot.tenantName} · {input.kind === "purchase" ? "Compra de ensayo" : input.kind === "enrollment" ? "Habilitar una nueva credencial" : "Revocar una credencial"}</p>
    {input.kind === "purchase" ? <dl className="grid gap-3 text-sm sm:grid-cols-2">
      <div><dt className="text-zinc-500">Folio</dt><dd>{input.purchase.folio}</dd></div>
      <div><dt className="text-zinc-500">Proveedor</dt><dd>{input.purchase.vendor}</dd></div>
      <div><dt className="text-zinc-500">Importe total</dt><dd className="text-xl font-semibold">{input.purchase.amount} {input.purchase.currency}</dd></div>
      <div><dt className="text-zinc-500">Concepto</dt><dd className="break-words">{input.purchase.description}</dd></div>
    </dl> : <p className="break-all text-sm">{input.kind === "enrollment" ? `Usuario destinatario: ${input.targetUserId}` : `Credencial destinataria: ${input.credentialId}`}</p>}
    <p className="break-all text-xs text-zinc-500">Contenido: {hash}</p>
  </section>;
}
