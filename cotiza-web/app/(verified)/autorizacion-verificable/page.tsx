import { SignInButton } from "@clerk/nextjs";
import { PilotConsole } from "@/components/autorizacion-verificable/pilot-console";
import { getApprovalActor } from "@/lib/auth/verified-authorization";
import { approvalState } from "@/lib/db/verified-authorization";
import { ApprovalError } from "@/lib/domain/verified-authorization";
export const dynamic = "force-dynamic";
export default async function VerifiedApprovalPage() {
  let state: Awaited<ReturnType<typeof approvalState>> | null = null;
  let failure: unknown;
  try {
    const actor = await getApprovalActor();
    state = await approvalState(actor);
  } catch (error) {
    failure = error;
  }
  if (state) return <PilotConsole key={`${state.tenant.id}:${state.actorId}`} state={state} />;
  return <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5"><h1 className="text-xl font-semibold">Autorización verificable · SynAppsSys</h1>
    <p>{failure instanceof ApprovalError ? failure.message : "El piloto requiere completar su configuración antes de utilizarse."}</p>
    {failure instanceof ApprovalError && failure.status === 401 ? <SignInButton forceRedirectUrl="/autorizacion-verificable"><button className="min-h-11 rounded-lg bg-zinc-900 px-4 py-2 text-white">Iniciar sesión</button></SignInButton> : null}</section>;
}
