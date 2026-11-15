/** Visibility only; API handlers recheck the database role. No credentials are exposed. */
export function gmailPilotVisible(tenant: { id: string; authMode: string; userId?: string | null; isSuperAdmin: boolean }) {
  return process.env.COTIZA_GMAIL_ENABLED === "true" && process.env.COTIZA_GMAIL_TENANT_ID === tenant.id
    && tenant.authMode === "clerk" && Boolean(tenant.userId) && tenant.isSuperAdmin;
}
