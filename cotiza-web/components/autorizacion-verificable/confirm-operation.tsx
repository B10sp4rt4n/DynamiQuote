"use client";
import { useEffect, useState, useTransition } from "react";
import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import type { getApproval } from "@/lib/db/verified-authorization";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { approvalFetch, control, primary, SnapshotCard, localTime } from "./shared";
import { clearApprovalToken, useApprovalToken } from "./use-approval-token";

type RequestView = Awaited<ReturnType<typeof getApproval>>;
export function ConfirmOperation({ id }: { id: string }) {
  const { userId } = useAuth();
  return <ConfirmationSession key={userId ?? "anonymous"} id={id} />;
}
function ConfirmationSession({ id }: { id: string }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const token = useApprovalToken(id);
  const [request, setRequest] = useState<RequestView | null>(null);
  const [tenantId, setTenantId] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => {
    if (!isSignedIn || !token) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/verified-authorization/requests/${id}`, { cache: "no-store", credentials: "same-origin", headers: { "X-Approval-Token": token! }, signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Solicitud no disponible");
        if (!controller.signal.aborted) { setRequest(data); setTenantId(data.snapshot.tenantId); setError(""); }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "No se pudo consultar la solicitud"); }
    }
    void load();
    return () => controller.abort();
  }, [id, isSignedIn, userId, token]);
  function decide(decision: "approved" | "rejected") {
    setError("");
    start(async () => {
      try {
        const { startAuthentication } = await import("@simplewebauthn/browser");
        const options = await approvalFetch<{ options: PublicKeyCredentialRequestOptionsJSON; challengeId: string }>(`requests/${id}/options`, tenantId, { token, decision });
        const response = await startAuthentication({ optionsJSON: options.options });
        const updated = await approvalFetch<RequestView>(`requests/${id}/confirm`, tenantId, { token, challengeId: options.challengeId, response });
        setRequest(updated); clearApprovalToken(id);
      } catch (e) { setError(e instanceof Error ? e.message : "No fue posible confirmar la operación"); }
    });
  }
  if (!isLoaded || token === null) return <p role="status">Preparando confirmación…</p>;
  if (!isSignedIn) return <section className="space-y-4"><h1 className="text-2xl font-semibold">Confirma tu identidad</h1><p>Inicia sesión con la cuenta destinataria de la solicitud de SynAppsSys.</p>
    <SignInButton forceRedirectUrl={`/confirmar-autorizacion/${id}`}><button className={primary}>Iniciar sesión en Cotiza</button></SignInButton></section>;
  return <section className="space-y-5 text-zinc-900">
    <div className="flex items-center justify-between gap-3"><h1 className="text-2xl font-semibold">Revisar autorización</h1><UserButton /></div>
    {error || (!token && !request) ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error || "Abre el enlace original de la solicitud para continuar."}</p> : null}
    {request ? <>
      <SnapshotCard value={request.snapshot} hash={request.payloadHash} />
      <p className="text-sm">Vigencia: {localTime(request.expiresAt)} · CDMX</p>
      <p className="text-sm">{request.kind === "purchase" ? "Esta compra es de ensayo y no genera cargos ni órdenes reales." : "Esta autorización administra las credenciales del piloto."}</p>
      {request.state === "pending" ? <><p className="text-sm">Confirma únicamente si reconoces el contenido. Tu credencial verificará esta decisión.</p><div className="flex flex-wrap gap-3">
        <button className={primary} disabled={pending} onClick={() => decide("approved")}>Autorizar {request.kind === "purchase" ? "ensayo" : "operación"}</button>
        <button className={control} disabled={pending} onClick={() => decide("rejected")}>Rechazar</button></div></>
        : <p role="status" className="rounded-lg border border-zinc-300 bg-white p-4">{request.state === "approved" ? "Autorización recibida. El solicitante ya puede aplicar esta decisión una sola vez." : `Estado: ${request.state}`}</p>}
    </> : !error && token ? <p role="status">Consultando solicitud…</p> : null}
    <Link href="/autorizacion-verificable" className="block text-sm underline">Mis credenciales y solicitudes</Link>
  </section>;
}
