"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ClientSummary } from "@/lib/db/clients";

type ClientLogoOption = {
  companyName: string | null;
  logoId: string;
  logoName: string;
};

type ClientShellProps = {
  clientLogos: ClientLogoOption[];
  initialClients: ClientSummary[];
};

type FormState = {
  address: string;
  clientLogoId: string;
  company: string;
  contactEmail: string;
  contactName: string;
  contactPhone: string;
  contactTitle: string;
  industry: string;
  notes: string;
  rfc: string;
};

const EMPTY_FORM: FormState = {
  address: "",
  clientLogoId: "",
  company: "",
  contactEmail: "",
  contactName: "",
  contactPhone: "",
  contactTitle: "",
  industry: "",
  notes: "",
  rfc: "",
};

export function ClientShell({ clientLogos, initialClients }: ClientShellProps) {
  const [availableClientLogos, setAvailableClientLogos] = useState<ClientLogoOption[]>(clientLogos);
  const [clients, setClients] = useState<ClientSummary[]>(initialClients);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoName, setLogoName] = useState("");
  const [logoUploadPending, setLogoUploadPending] = useState(false);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientSummary | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clientLogoFileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchClients = useCallback(async (q: string) => {
    try {
      const params = q.trim() ? `?search=${encodeURIComponent(q.trim())}` : "";
      const res = await fetch(`/api/clients${params}`);
      if (!res.ok) return;
      const data = (await res.json()) as { clients: ClientSummary[] };
      setClients(data.clients);
    } catch {
      // silencioso — no interrumpir UX
    }
  }, []);

  // Buscar con debounce
  useEffect(() => {
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }
    searchTimeout.current = setTimeout(() => {
      void fetchClients(search);
    }, 300);

    return () => {
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current);
      }
    };
  }, [search, fetchClients]);

  useEffect(() => {
    setAvailableClientLogos(clientLogos);
  }, [clientLogos]);

  function openNew() {
    setEditingClient(null);
    setForm(EMPTY_FORM);
    setLogoFile(null);
    setLogoName("");
    setMessage(null);
    setShowModal(true);
  }

  function openEdit(client: ClientSummary) {
    setEditingClient(client);
    setForm({
      address: client.address ?? "",
      clientLogoId: client.clientLogoId ?? "",
      company: client.company,
      contactEmail: client.contactEmail ?? "",
      contactName: client.contactName ?? "",
      contactPhone: client.contactPhone ?? "",
      contactTitle: client.contactTitle ?? "",
      industry: client.industry ?? "",
      notes: client.notes ?? "",
      rfc: client.rfc ?? "",
    });
    setLogoFile(null);
    setLogoName("");
    setMessage(null);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingClient(null);
    setMessage(null);
  }

  function setField(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleClientLogoUpload() {
    const fileFromInput = clientLogoFileInputRef.current?.files?.[0] ?? null;
    const selectedFile = fileFromInput ?? logoFile;

    if (!selectedFile) {
      setMessage({ text: "Selecciona un archivo de logo para subir.", type: "error" });
      return;
    }

    setLogoUploadPending(true);
    setMessage(null);

    try {
      const payload = new FormData();
      payload.append("logoType", "client");
      payload.append("logoFile", selectedFile);
      payload.append("logoName", logoName.trim() || selectedFile.name);
      payload.append("companyName", form.company.trim());
      payload.append("isDefault", "false");

      const res = await fetch("/api/settings/issuer-profiles", {
        body: payload,
        method: "POST",
      });

      const data = (await res.json()) as {
        error?: string;
        profile?: {
          companyName: string | null;
          logoId: string;
          logoName: string;
          logoType: string;
        };
      };

      if (!res.ok || !data.profile || data.profile.logoType !== "client") {
        setMessage({ text: data.error ?? "No se pudo cargar el logo.", type: "error" });
        return;
      }

      const uploadedLogo: ClientLogoOption = {
        companyName: data.profile.companyName,
        logoId: data.profile.logoId,
        logoName: data.profile.logoName,
      };

      setAvailableClientLogos((prev) => {
        const next = [uploadedLogo, ...prev.filter((logo) => logo.logoId !== uploadedLogo.logoId)];
        return next;
      });

      setField("clientLogoId", uploadedLogo.logoId);
      if (clientLogoFileInputRef.current) {
        clientLogoFileInputRef.current.value = "";
      }
      setLogoFile(null);
      setLogoName("");
      setMessage({ text: "Logo cargado y seleccionado para este cliente.", type: "success" });
    } catch {
      setMessage({ text: "Error de conexión al cargar el logo.", type: "error" });
    } finally {
      setLogoUploadPending(false);
    }
  }

  async function handleSave() {
    if (!form.company.trim()) {
      setMessage({ text: "La empresa es requerida.", type: "error" });
      return;
    }

    setSaving(true);
    setMessage(null);

    const payload = {
      address: form.address.trim() || null,
      clientLogoId: form.clientLogoId || null,
      company: form.company.trim(),
      contactEmail: form.contactEmail.trim() || null,
      contactName: form.contactName.trim() || null,
      contactPhone: form.contactPhone.trim() || null,
      contactTitle: form.contactTitle.trim() || null,
      industry: form.industry.trim() || null,
      notes: form.notes.trim() || null,
      rfc: form.rfc.trim() || null,
    };

    try {
      let res: Response;

      if (editingClient) {
        res = await fetch(`/api/clients/${editingClient.clientId}`, {
          body: JSON.stringify(payload),
          headers: { "Content-Type": "application/json" },
          method: "PATCH",
        });
      } else {
        res = await fetch("/api/clients", {
          body: JSON.stringify(payload),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
      }

      const data = (await res.json()) as { client?: ClientSummary; error?: unknown };

      if (!res.ok || !data.client) {
        setMessage({ text: "No se pudo guardar el cliente. Intenta nuevamente.", type: "error" });
        return;
      }

      setMessage({ text: editingClient ? "Cliente actualizado." : "Cliente creado.", type: "success" });

      // Actualizar lista local
      if (editingClient) {
        setClients((prev) =>
          prev.map((c) => (c.clientId === data.client!.clientId ? data.client! : c)),
        );
      } else {
        setClients((prev) => [data.client!, ...prev]);
      }

      setTimeout(() => {
        closeModal();
      }, 800);
    } catch {
      setMessage({ text: "Error de conexión. Intenta nuevamente.", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(client: ClientSummary) {
    try {
      const res = await fetch(`/api/clients/${client.clientId}`, {
        body: JSON.stringify({ active: !client.active }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });

      if (!res.ok) return;

      const data = (await res.json()) as { client?: ClientSummary };

      if (data.client) {
        setClients((prev) =>
          prev.map((c) => (c.clientId === data.client!.clientId ? data.client! : c)),
        );
      }
    } catch {
      // silencioso
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Clientes</h1>
          <p className="mt-1 text-sm text-zinc-500">Catálogo de clientes del tenant. Los datos se reutilizan en cotizaciones y propuestas.</p>
        </div>
        <button
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
          onClick={openNew}
          type="button"
        >
          + Nuevo cliente
        </button>
      </div>

      <input
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 sm:max-w-sm"
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por empresa, contacto o email"
        value={search}
      />

      {clients.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
          <p className="text-sm text-zinc-500">
            {search.trim() ? "No hay clientes que coincidan con la búsqueda." : "Aún no hay clientes. Crea el primero."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="min-w-full divide-y divide-zinc-200 text-sm">
            <thead className="bg-zinc-50 text-left text-zinc-600">
              <tr>
                <th className="px-4 py-3 font-medium">Empresa</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Contacto</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Logo</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Email</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Teléfono</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {clients.map((client) => (
                <tr className={`hover:bg-zinc-50 ${!client.active ? "opacity-50" : ""}`} key={client.clientId}>
                  <td className="px-4 py-3 font-medium text-zinc-900">
                    {client.company}
                    {client.rfc ? <span className="ml-2 text-xs text-zinc-400">{client.rfc}</span> : null}
                  </td>
                  <td className="hidden px-4 py-3 text-zinc-600 md:table-cell">
                    {client.contactName ?? "—"}
                    {client.contactTitle ? <span className="block text-xs text-zinc-400">{client.contactTitle}</span> : null}
                  </td>
                  <td className="hidden px-4 py-3 text-zinc-600 md:table-cell">
                    {client.clientLogoId
                      ? availableClientLogos.find((logo) => logo.logoId === client.clientLogoId)?.logoName ?? "Logo no disponible"
                      : "—"}
                  </td>
                  <td className="hidden px-4 py-3 text-zinc-600 lg:table-cell">{client.contactEmail ?? "—"}</td>
                  <td className="hidden px-4 py-3 text-zinc-600 lg:table-cell">{client.contactPhone ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        client.active ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {client.active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        className="text-xs font-medium text-zinc-600 hover:text-zinc-900"
                        onClick={() => openEdit(client)}
                        type="button"
                      >
                        Editar
                      </button>
                      <button
                        className="text-xs font-medium text-zinc-400 hover:text-zinc-600"
                        onClick={() => { void handleToggleActive(client); }}
                        type="button"
                      >
                        {client.active ? "Desactivar" : "Activar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal nuevo/editar cliente */}
      {showModal ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
          <div className="flex w-full max-w-lg max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
              <h2 className="text-base font-semibold text-zinc-900">
                {editingClient ? "Editar cliente" : "Nuevo cliente"}
              </h2>
              <button
                className="text-zinc-400 hover:text-zinc-700"
                onClick={closeModal}
                type="button"
              >
                ✕
              </button>
            </div>
            <div className="grid flex-1 gap-4 overflow-y-auto px-6 py-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-zinc-700">Empresa *</label>
                <input
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                  onChange={(e) => setField("company", e.target.value)}
                  placeholder="Nombre de la empresa"
                  value={form.company}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">RFC</label>
                <input
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                  onChange={(e) => setField("rfc", e.target.value)}
                  placeholder="RFC"
                  value={form.rfc}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Industria</label>
                <input
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                  onChange={(e) => setField("industry", e.target.value)}
                  placeholder="Ej. Limpieza industrial"
                  value={form.industry}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-zinc-700">Dirección</label>
                <input
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                  onChange={(e) => setField("address", e.target.value)}
                  placeholder="Dirección"
                  value={form.address}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-zinc-700">Logo del cliente</label>
                <select
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                  onChange={(e) => setField("clientLogoId", e.target.value)}
                  value={form.clientLogoId}
                >
                  <option value="">Sin logo</option>
                  {availableClientLogos.map((logo) => (
                    <option key={logo.logoId} value={logo.logoId}>
                      {logo.logoName}
                      {logo.companyName ? ` (${logo.companyName})` : ""}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-zinc-500">Puedes elegir uno existente o subir uno nuevo aquí mismo.</p>
              </div>
              <div className="sm:col-span-2 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-3">
                <p className="text-xs font-medium text-zinc-700">Subir nuevo logo de cliente</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                    onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                    ref={clientLogoFileInputRef}
                    type="file"
                  />
                  <button
                    className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
                    disabled={logoUploadPending}
                    onClick={() => { void handleClientLogoUpload(); }}
                    type="button"
                  >
                    {logoUploadPending ? "Subiendo..." : "Subir logo"}
                  </button>
                </div>
                <input
                  className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                  onChange={(e) => setLogoName(e.target.value)}
                  placeholder="Nombre opcional del logo"
                  value={logoName}
                />
                <p className="mt-2 text-xs text-zinc-500">
                  {logoFile ? `Archivo seleccionado: ${logoFile.name}` : "Ningún archivo seleccionado todavía."}
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Contacto principal</label>
                <input
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                  onChange={(e) => setField("contactName", e.target.value)}
                  placeholder="Nombre del contacto"
                  value={form.contactName}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Cargo</label>
                <input
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                  onChange={(e) => setField("contactTitle", e.target.value)}
                  placeholder="Ej. Gerente de compras"
                  value={form.contactTitle}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Email</label>
                <input
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                  onChange={(e) => setField("contactEmail", e.target.value)}
                  placeholder="email@empresa.com"
                  type="email"
                  value={form.contactEmail}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Teléfono</label>
                <input
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                  onChange={(e) => setField("contactPhone", e.target.value)}
                  placeholder="55 1234 5678"
                  value={form.contactPhone}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-zinc-700">Notas</label>
                <textarea
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                  onChange={(e) => setField("notes", e.target.value)}
                  placeholder="Notas internas del cliente"
                  rows={3}
                  value={form.notes}
                />
              </div>
            </div>
            {message ? (
              <div className="px-6 pb-2">
                <p className={`text-sm ${message.type === "error" ? "text-rose-700" : "text-emerald-700"}`}>
                  {message.text}
                </p>
              </div>
            ) : null}
            <div className="flex shrink-0 justify-end gap-3 border-t border-zinc-200 bg-white px-6 py-4">
              <button
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                onClick={closeModal}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={saving}
                onClick={() => { void handleSave(); }}
                type="button"
              >
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
