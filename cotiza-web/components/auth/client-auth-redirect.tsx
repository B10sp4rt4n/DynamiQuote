"use client";

import { useEffect } from "react";
import { useAuth, useUser } from "@clerk/nextjs";

type ClientAuthRedirectProps = {
  target: string;
};

const DEV_CLERK_SESSION_COOKIE = "dev_clerk_client_session";
const DEV_CLERK_USER_ID_COOKIE = "dev_clerk_user_id";
const DEV_CLERK_TENANT_ID_COOKIE = "dev_clerk_tenant_id";
const DEV_CLERK_TENANT_SLUG_COOKIE = "dev_clerk_tenant_slug";
const DEV_CLERK_EMAIL_ALIAS_COOKIE = "dev_clerk_email_alias";
const DEV_CLERK_FIRST_NAME_COOKIE = "dev_clerk_first_name";
const DEV_CLERK_LAST_NAME_COOKIE = "dev_clerk_last_name";

function setDevCookie(name: string, value: string | null) {
  if (!value || value.trim().length === 0) {
    return;
  }

  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax`;
}

export function ClientAuthRedirect({ target }: ClientAuthRedirectProps) {
  const { isLoaded, sessionClaims, userId } = useAuth();
  const { user } = useUser();

  useEffect(() => {
    if (!isLoaded || !userId) {
      return;
    }

    if (process.env.NODE_ENV === "development") {
      const emailAddress = user?.primaryEmailAddress?.emailAddress?.trim().toLowerCase() ?? null;
      const emailAlias = emailAddress?.split("@")[0] ?? null;
      const metadata = sessionClaims && typeof sessionClaims === "object"
        ? ((sessionClaims.metadata ?? sessionClaims.publicMetadata ?? sessionClaims.unsafeMetadata ?? null) as
            | Record<string, unknown>
            | null)
        : null;
      const tenantId =
        (typeof metadata?.tenantId === "string" ? metadata.tenantId : null) ??
        (typeof user?.publicMetadata?.tenantId === "string" ? user.publicMetadata.tenantId : null);
      const tenantSlug =
        (typeof metadata?.tenantSlug === "string" ? metadata.tenantSlug : null) ??
        (typeof user?.publicMetadata?.tenantSlug === "string" ? user.publicMetadata.tenantSlug : null) ??
        (typeof sessionClaims?.org_slug === "string" ? sessionClaims.org_slug : null);

      setDevCookie(DEV_CLERK_SESSION_COOKIE, "1");
      setDevCookie(DEV_CLERK_USER_ID_COOKIE, userId);
      setDevCookie(DEV_CLERK_TENANT_ID_COOKIE, tenantId);
      setDevCookie(DEV_CLERK_TENANT_SLUG_COOKIE, tenantSlug);
      setDevCookie(DEV_CLERK_EMAIL_ALIAS_COOKIE, emailAlias);
      setDevCookie(DEV_CLERK_FIRST_NAME_COOKIE, user?.firstName ?? null);
      setDevCookie(DEV_CLERK_LAST_NAME_COOKIE, user?.lastName ?? null);
    }

    window.location.replace(target);
  }, [isLoaded, sessionClaims, target, user, userId]);

  if (!isLoaded || !userId) {
    return null;
  }

  return (
    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
      Sesion detectada. Redirigiendo a la aplicacion...
    </div>
  );
}
