import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";

import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { hasClerkCredentials } from "@/lib/auth/clerk";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

// Diagnostic only: exact IDs and invitation metadata, never email-based relinking.
// No metadata writes, tokens, invitations, emails or local membership mutations.
export async function GET() {
  const tenant = await getCurrentTenantContext();
  if (!tenant) return NextResponse.json({ error: "No autorizado" }, { status: 401, headers });
  if (!tenant.isSuperAdmin) return NextResponse.json({ error: "Solo superadmin" }, { status: 403, headers });
  if (!hasClerkCredentials()) return NextResponse.json({ error: "Clerk no configurado" }, { status: 503, headers });

  const users = await prisma.app_users.findMany({
    where: { active: true }, take: 501, orderBy: { user_id: "asc" },
    select: { user_id: true, alias: true, role: true, email: true, tenant_id: true, tenants: { select: { slug: true } } },
  });
  if (users.length > 500) return NextResponse.json({ error: "El diagnostico requiere un lote menor" }, { status: 422, headers });
  try {
    const client = await clerkClient();
    const pending = users.some((user) => user.user_id.startsWith("pending_"));
    const invitations = pending ? await client.invitations.getInvitationList({ status: "pending", limit: 100 }) : null;
    const invitationListComplete = !invitations || invitations.totalCount <= invitations.data.length;
    const results = [];
    for (const user of users) {
      const local = { user_id: user.user_id, alias: user.alias, role: user.role, tenant_id: user.tenant_id, tenant_slug: user.tenants?.slug ?? null };
      if (user.user_id.startsWith("pending_")) {
        const matches = invitations!.data.filter((invitation) =>
          invitation.publicMetadata?.localUserId === user.user_id && invitation.publicMetadata?.tenantId === user.tenant_id,
        );
        const matchingEmail = matches.length === 1 && !!user.email &&
          matches[0].emailAddress.trim().toLowerCase() === user.email.trim().toLowerCase();
        results.push({ ...local, status: "pending_local_id", invitation_matches: matches.length,
          invitation_email_matches_local: matchingEmail, invitation_search_complete: invitationListComplete });
        continue;
      }
      if (!user.user_id.startsWith("user_")) {
        results.push({ ...local, status: "legacy_local_id", provider_lookup: "not_attempted" });
        continue;
      }
      try {
        const identity = await client.users.getUser(user.user_id);
        const emailMatches = !!user.email && identity.emailAddresses.some((email) =>
          email.emailAddress.trim().toLowerCase() === user.email!.trim().toLowerCase() && email.verification?.status === "verified",
        );
        results.push({ ...local,
          status: identity.id !== user.user_id ? "provider_id_mismatch" : identity.banned ? "provider_banned" : identity.locked ? "provider_locked" : "exact_id_found",
          verified_email_matches_local: emailMatches,
        });
      } catch (error) {
        const status = typeof error === "object" && error !== null && "status" in error ? error.status : null;
        results.push({ ...local, status: status === 404 ? "provider_not_found" : "provider_lookup_failed" });
      }
    }
    return NextResponse.json({ checked_at: new Date().toISOString(), read_only: true,
      identity_proof: "provider_lookup_by_exact_id; does_not_prove_user_login",
      invitations_complete: invitationListComplete, users: results }, { headers });
  } catch {
    return NextResponse.json({ error: "No fue posible consultar Clerk; no se modificaron identidades" }, { status: 503, headers });
  }
}
