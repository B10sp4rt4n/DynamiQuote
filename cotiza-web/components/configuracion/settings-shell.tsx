"use client";

import { useState, type FormEvent } from "react";

import type { AppUserSummary, IssuerProfileSummary } from "@/lib/db/settings";
import type { ActiveTenantOption } from "@/lib/db/tenants";

type SettingsShellProps = {
  canManageAllTenants?: boolean;
  issuerProfiles: IssuerProfileSummary[];
  tenantOptions?: ActiveTenantOption[];
  tenantName: string;
  users: AppUserSummary[];
};

type Tab = "users" | "issuer";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(value));
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    admin: "bg-violet-100 text-violet-800",
    user: "bg-zinc-100 text-zinc-700",
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
  onUserUpdated,
  users,
}: {
  canManageAllTenants?: boolean;
  onUserUpdated: (user: AppUserSummary) => void;
  users: AppUserSummary[];
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      <div className="overflow-hidden rounded-xl border border-zinc-200">
        <table className="min-w-full divide-y divide-zinc-200 text-sm">
          <thead className="bg-zinc-50 text-left text-zinc-600">
            <tr>
              {canManageAllTenants ? <th className="px-4 py-3 font-medium">Empresa</th> : null}
              <th className="px-4 py-3 font-medium">Usuario</th>
              <th className="px-4 py-3 font-medium">Alias</th>
              <th className="px-4 py-3 font-medium">Rol</th>
              <th className="px-4 py-3 font-medium">Subtenant</th>
              <th className="px-4 py-3 font-medium">Código vendedor</th>
              <th className="px-4 py-3 font-medium">Alta</th>
              <th className="px-4 py-3 font-medium">Estado</th>
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
  canManageAllTenants,
  onCreated,
  tenantOptions,
}: {
  canManageAllTenants: boolean;
  onCreated: (user: AppUserSummary) => void;
  tenantOptions: ActiveTenantOption[];
}) {
  const [alias, setAlias] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [sellerCode, setSellerCode] = useState("");
  const [tenantId, setTenantId] = useState(tenantOptions[0]?.id ?? "");
  const [userId, setUserId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const payload = {
        alias,
        firstName,
        lastName,
        sellerCode: sellerCode || null,
        tenantId: canManageAllTenants ? tenantId : undefined,
        userId,
      };

      const res = await fetch("/api/settings/users", {
        body: JSON.stringify(payload),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      const data = (await res.json()) as { error?: string; user?: AppUserSummary };

      if (!res.ok || !data.user) {
        throw new Error(data.error ?? "No fue posible crear el usuario");
      }

      onCreated(data.user);
      setAlias("");
      setFirstName("");
      setLastName("");
      setSellerCode("");
      setUserId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4" onSubmit={onSubmit}>
      <p className="text-sm font-medium text-zinc-800">Alta de subtenant (usuario estandar)</p>
      <div className="grid gap-3 md:grid-cols-2">
        <input
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          onChange={(event) => setUserId(event.target.value)}
          placeholder="userId de Clerk"
          required
          value={userId}
        />
        <input
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          onChange={(event) => setAlias(event.target.value)}
          placeholder="Alias"
          required
          value={alias}
        />
        <input
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          onChange={(event) => setFirstName(event.target.value)}
          placeholder="Nombre"
          required
          value={firstName}
        />
        <input
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          onChange={(event) => setLastName(event.target.value)}
          placeholder="Apellidos"
          required
          value={lastName}
        />
        <input
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          onChange={(event) => setSellerCode(event.target.value)}
          placeholder="Codigo vendedor (opcional)"
          value={sellerCode}
        />
        {canManageAllTenants ? (
          <select
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
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
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
      <div>
        <button
          className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending ? "Creando..." : "Crear usuario subtenant"}
        </button>
      </div>
    </form>
  );
}

function IssuerProfilesTab({ issuerProfiles: initial }: { issuerProfiles: IssuerProfileSummary[] }) {
  const [profiles, setProfiles] = useState(initial);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setDefault(logoId: string) {
    setPending(logoId);
    setError(null);
    try {
      const res = await fetch(`/api/settings/issuer-profiles/${logoId}`, { method: "PATCH" });
      const data = (await res.json()) as { error?: string; profile?: IssuerProfileSummary };
      if (!res.ok || !data.profile) throw new Error(data.error ?? "Error al actualizar perfil");
      setProfiles((prev) =>
        prev.map((p) => ({
          ...p,
          isDefault: p.logoId === logoId,
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      <div className="overflow-hidden rounded-xl border border-zinc-200">
        <table className="min-w-full divide-y divide-zinc-200 text-sm">
          <thead className="bg-zinc-50 text-left text-zinc-600">
            <tr>
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
                <td className="px-4 py-3 text-zinc-900">{profile.logoName}</td>
                <td className="px-4 py-3 text-zinc-600">{profile.companyName ?? "—"}</td>
                <td className="px-4 py-3 text-zinc-500">{profile.logoType}</td>
                <td className="px-4 py-3 font-mono text-xs uppercase text-zinc-500">
                  {profile.logoFormat}
                </td>
                <td className="px-4 py-3 text-zinc-500">{formatDate(profile.uploadedAt)}</td>
                <td className="px-4 py-3">
                  {profile.isDefault ? (
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
  tenantName,
  canManageAllTenants = false,
  tenantOptions = [],
}: SettingsShellProps) {
  const [tab, setTab] = useState<Tab>("users");
  const [usersState, setUsersState] = useState(users);

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
        <button className={tabClass("users")} onClick={() => setTab("users")} type="button">
          Usuarios ({usersState.length})
        </button>
        <button className={tabClass("issuer")} onClick={() => setTab("issuer")} type="button">
          Perfiles emisor ({issuerProfiles.length})
        </button>
      </div>

      <div className="mt-5">
        {tab === "users" && (
          <div className="space-y-4">
            <CreateUserForm
              canManageAllTenants={canManageAllTenants}
              onCreated={pushUser}
              tenantOptions={tenantOptions}
            />
            <UsersTab
              canManageAllTenants={canManageAllTenants}
              onUserUpdated={(updated) => {
                setUsersState((prev) => prev.map((user) => (user.userId === updated.userId ? updated : user)));
              }}
              users={usersState}
            />
          </div>
        )}
        {tab === "issuer" && <IssuerProfilesTab issuerProfiles={issuerProfiles} />}
      </div>
    </section>
  );
}
