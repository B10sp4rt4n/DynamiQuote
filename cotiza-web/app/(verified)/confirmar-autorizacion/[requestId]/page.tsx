import { notFound } from "next/navigation";
import { ConfirmOperation } from "@/components/autorizacion-verificable/confirm-operation";
import { hasClerkCredentials } from "@/lib/auth/clerk";
export const dynamic = "force-dynamic";
export default async function ConfirmApprovalPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  if (!/^[a-f0-9-]{36}$/.test(requestId)) notFound();
  if (!hasClerkCredentials() || process.env.COTIZA_APPROVAL_ENABLED !== "true") return <p>El piloto de confirmación no está habilitado.</p>;
  return <ConfirmOperation id={requestId} />;
}
