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
                      <span className="text-xs font-medium text-zinc-600">Protegido</span>
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
                          className="rounded-lg bg-rose-100 px-3 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-200 disabled:opacity-60"
                          disabled={pending === `delete:${user.userId}`}
                          onClick={() => deleteUser(user)}
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
  canManageAllTenants,
  onCreated,
  tenantOptions,
}: {
  canManageAllTenants: boolean;
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
          placeholder="ID de Clerk (opcional)"
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
  const [pending, setPending] = useState(false);
  const [historyPending, setHistoryPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<TestEmailHistoryItem[]>([]);
  const [success, setSuccess] = useState<string | null>(null);

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
            {history.map((item) => (
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
        {tab === "issuer" && <IssuerProfilesTab issuerProfiles={issuerProfiles} />}
      </div>
    </section>
  );
}
