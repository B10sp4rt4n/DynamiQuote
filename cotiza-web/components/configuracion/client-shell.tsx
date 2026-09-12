"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ClientContact } from "@/lib/db/client-contacts";
import type { ClientSummary } from "@/lib/db/clients";
import type { InteractionLog } from "@/lib/db/interaction-logs";

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
  contactFirstName: string;
  contactLastName: string;
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
  contactFirstName: "",
  contactLastName: "",
  contactPhone: "",
  contactTitle: "",
  industry: "",
  notes: "",
  rfc: "",
};

// Adivina nombre/apellido a partir del contacto combinado legado, solo como
// valor inicial editable en el formulario -- no se guarda nada hasta que el
// usuario confirme (o corrija) y de "Guardar". No es backfill de BD.
function splitLegacyContactName(contactName: string | null): { firstName: string; lastName: string } {
  const trimmed = contactName?.trim() ?? "";
  if (!trimmed) return { firstName: "", lastName: "" };

  const [firstName, ...rest] = trimmed.split(/\s+/);
  return { firstName: firstName ?? "", lastName: rest.join(" ") };
}

type OpenOpportunityOption = {
  opportunityId: string;
  opportunityNumber: string;
  title: string;
};

const AVATAR_TINTS = [
  { bg: "bg-teal-100", text: "text-teal-700" },
  { bg: "bg-orange-100", text: "text-orange-700" },
  { bg: "bg-slate-200", text: "text-slate-700" },
];

function getAvatarTint(index: number) {
  return AVATAR_TINTS[index % AVATAR_TINTS.length]!;
}

function getInitials(company: string): string {
  const words = company.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
}

function IconSearch({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" x2="16.65" y1="21" y2="16.65" />
    </svg>
  );
}

function IconPlus({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
      <line x1="12" x2="12" y1="5" y2="19" />
      <line x1="5" x2="19" y1="12" y2="12" />
    </svg>
  );
}

function IconPencil({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} viewBox="0 0 24 24">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function IconCalendarPlus({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} viewBox="0 0 24 24">
      <rect height="18" rx="2" width="18" x="3" y="4" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
      <line x1="12" x2="12" y1="14" y2="18" />
      <line x1="10" x2="14" y1="16" y2="16" />
    </svg>
  );
}

function IconPower({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} viewBox="0 0 24 24">
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
      <line x1="12" x2="12" y1="2" y2="12" />
    </svg>
  );
}

function IconMail({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} viewBox="0 0 24 24">
      <rect height="16" rx="2" width="20" x="2" y="4" />
      <path d="m22 6-10 7L2 6" />
    </svg>
  );
}

function IconPhone({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} viewBox="0 0 24 24">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}

function IconEye({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} viewBox="0 0 24 24">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

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

  const [taskClient, setTaskClient] = useState<ClientSummary | null>(null);
  const [taskDescription, setTaskDescription] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskOpportunityId, setTaskOpportunityId] = useState("");
  const [taskOpportunities, setTaskOpportunities] = useState<OpenOpportunityOption[]>([]);
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskMessage, setTaskMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const [otherContacts, setOtherContacts] = useState<ClientContact[]>([]);
  const [newContactFirstName, setNewContactFirstName] = useState("");
  const [newContactLastName, setNewContactLastName] = useState("");
  const [newContactTitle, setNewContactTitle] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [contactSaving, setContactSaving] = useState(false);
  const [contactMessage, setContactMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const [interactionLogs, setInteractionLogs] = useState<InteractionLog[]>([]);
  const [editOpportunities, setEditOpportunities] = useState<OpenOpportunityOption[]>([]);
  const [newInteractionNote, setNewInteractionNote] = useState("");
  const [newInteractionOpportunityId, setNewInteractionOpportunityId] = useState("");
  const [interactionSaving, setInteractionSaving] = useState(false);
  const [interactionMessage, setInteractionMessage] = useState<{ text: string; type: "success" | "error" } | null>(
    null,
  );

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

  async function openEdit(client: ClientSummary) {
    setEditingClient(client);
    const hasSplitName = Boolean(client.contactFirstName || client.contactLastName);
    const guessedName = hasSplitName
      ? { firstName: client.contactFirstName ?? "", lastName: client.contactLastName ?? "" }
      : splitLegacyContactName(client.contactName);
    setForm({
      address: client.address ?? "",
      clientLogoId: client.clientLogoId ?? "",
      company: client.company,
      contactEmail: client.contactEmail ?? "",
      contactFirstName: guessedName.firstName,
      contactLastName: guessedName.lastName,
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

    setOtherContacts([]);
    setNewContactFirstName("");
    setNewContactLastName("");
    setNewContactTitle("");
    setNewContactEmail("");
    setNewContactPhone("");
    setContactMessage(null);

    setInteractionLogs([]);
    setEditOpportunities([]);
    setNewInteractionNote("");
    setNewInteractionOpportunityId("");
    setInteractionMessage(null);

    try {
      const res = await fetch(`/api/clients/${client.clientId}/contacts`);
      if (res.ok) {
        const data = (await res.json()) as { contacts?: ClientContact[] };
        setOtherContacts(data.contacts ?? []);
      }
    } catch {
      // silencioso -- la seccion simplemente queda vacia
    }

    try {
      const [interactionsRes, opportunitiesRes] = await Promise.all([
        fetch(`/api/clients/${client.clientId}/interactions`),
        fetch(`/api/clients/${client.clientId}/opportunities`),
      ]);

      if (interactionsRes.ok) {
        const data = (await interactionsRes.json()) as { interactions?: InteractionLog[] };
        setInteractionLogs(data.interactions ?? []);
      }

      if (opportunitiesRes.ok) {
        const data = (await opportunitiesRes.json()) as { opportunities?: OpenOpportunityOption[] };
        setEditOpportunities(data.opportunities ?? []);
      }
    } catch {
      // silencioso -- la seccion simplemente queda vacia
    }
  }

  async function handleAddContact() {
    if (!editingClient) return;

    if (!newContactFirstName.trim()) {
      setContactMessage({ text: "El nombre es requerido.", type: "error" });
      return;
    }

    setContactSaving(true);
    setContactMessage(null);

    try {
      const res = await fetch(`/api/clients/${editingClient.clientId}/contacts`, {
        body: JSON.stringify({
          email: newContactEmail.trim() || null,
          firstName: newContactFirstName.trim(),
          lastName: newContactLastName.trim() || null,
          phone: newContactPhone.trim() || null,
          title: newContactTitle.trim() || null,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      const data = (await res.json()) as { contact?: ClientContact; error?: string };

      if (!res.ok || !data.contact) {
        setContactMessage({ text: data.error ?? "No se pudo agregar el contacto.", type: "error" });
        return;
      }

      setOtherContacts((prev) => [...prev, data.contact!]);
      setNewContactFirstName("");
      setNewContactLastName("");
      setNewContactTitle("");
      setNewContactEmail("");
      setNewContactPhone("");
    } catch {
      setContactMessage({ text: "Error de conexión. Intenta nuevamente.", type: "error" });
    } finally {
      setContactSaving(false);
    }
  }

  async function handleDeleteContact(contact: ClientContact) {
    if (!editingClient) return;
    if (!confirm(`¿Borrar a ${contact.firstName} de los contactos de este cliente?`)) return;

    try {
      const res = await fetch(`/api/clients/${editingClient.clientId}/contacts/${contact.contactId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        setContactMessage({ text: "No se pudo borrar el contacto.", type: "error" });
        return;
      }

      setOtherContacts((prev) => prev.filter((c) => c.contactId !== contact.contactId));
    } catch {
      setContactMessage({ text: "Error de conexión. Intenta nuevamente.", type: "error" });
    }
  }

  async function handleAddInteraction() {
    if (!editingClient) return;

    if (!newInteractionNote.trim()) {
      setInteractionMessage({ text: "La nota no puede estar vacía.", type: "error" });
      return;
    }

    setInteractionSaving(true);
    setInteractionMessage(null);

    try {
      const res = await fetch(`/api/clients/${editingClient.clientId}/interactions`, {
        body: JSON.stringify({
          note: newInteractionNote.trim(),
          opportunityId: newInteractionOpportunityId || null,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      const data = (await res.json()) as { error?: string; interaction?: InteractionLog };

      if (!res.ok || !data.interaction) {
        setInteractionMessage({ text: data.error ?? "No se pudo agregar la nota.", type: "error" });
        return;
      }

      setInteractionLogs((prev) => [data.interaction!, ...prev]);
      setNewInteractionNote("");
      setNewInteractionOpportunityId("");
    } catch {
      setInteractionMessage({ text: "Error de conexión. Intenta nuevamente.", type: "error" });
    } finally {
      setInteractionSaving(false);
    }
  }

  async function handleDeleteInteraction(interaction: InteractionLog) {
    if (!editingClient) return;
    if (!confirm("¿Borrar esta nota del historial?")) return;

    try {
      const res = await fetch(
        `/api/clients/${editingClient.clientId}/interactions/${interaction.interactionId}`,
        { method: "DELETE" },
      );

      if (!res.ok) {
        setInteractionMessage({ text: "No se pudo borrar la nota.", type: "error" });
        return;
      }

      setInteractionLogs((prev) => prev.filter((i) => i.interactionId !== interaction.interactionId));
    } catch {
      setInteractionMessage({ text: "Error de conexión. Intenta nuevamente.", type: "error" });
    }
  }

  function closeModal() {
    setShowModal(false);
    setEditingClient(null);
    setMessage(null);
  }

  async function openTaskModal(client: ClientSummary) {
    setTaskClient(client);
    setTaskDescription("");
    setTaskDueDate("");
    setTaskOpportunityId("");
    setTaskMessage(null);
    setTaskOpportunities([]);

    try {
      const res = await fetch(`/api/clients/${client.clientId}/opportunities`);
      if (res.ok) {
        const data = (await res.json()) as { opportunities?: OpenOpportunityOption[] };
        setTaskOpportunities(data.opportunities ?? []);
      }
    } catch {
      // silencioso -- el selector simplemente queda vacio
    }
  }

  function closeTaskModal() {
    setTaskClient(null);
    setTaskMessage(null);
  }

  async function handleSaveTask() {
    if (!taskClient) return;

    if (!taskDescription.trim()) {
      setTaskMessage({ text: "Describe la tarea.", type: "error" });
      return;
    }

    if (!taskDueDate) {
      setTaskMessage({ text: "Elige una fecha.", type: "error" });
      return;
    }

    setTaskSaving(true);
    setTaskMessage(null);

    try {
      const res = await fetch("/api/tasks", {
        body: JSON.stringify({
          clientId: taskClient.clientId,
          description: taskDescription.trim(),
          dueDate: taskDueDate,
          opportunityId: taskOpportunityId || null,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setTaskMessage({ text: data?.error ?? "No se pudo guardar la tarea.", type: "error" });
        return;
      }

      setTaskMessage({ text: "Tarea creada.", type: "success" });
      setTimeout(() => {
        closeTaskModal();
      }, 800);
    } catch {
      setTaskMessage({ text: "Error de conexión. Intenta nuevamente.", type: "error" });
    } finally {
      setTaskSaving(false);
    }
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
      contactFirstName: form.contactFirstName.trim() || null,
      contactLastName: form.contactLastName.trim() || null,
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Clientes</h1>
            <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
              {clients.length} {clients.length === 1 ? "cuenta" : "cuentas"}
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-500">Catálogo de clientes del tenant. Los datos se reutilizan en cotizaciones y propuestas.</p>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          onClick={openNew}
          type="button"
        >
          <IconPlus className="h-4 w-4" />
          Nuevo cliente
        </button>
      </div>

      <div className="relative sm:max-w-sm">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm text-zinc-900"
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por empresa, contacto o email"
          value={search}
        />
      </div>

      {clients.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
          <p className="text-sm text-zinc-500">
            {search.trim() ? "No hay clientes que coincidan con la búsqueda." : "Aún no hay clientes. Crea el primero."}
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-zinc-200 bg-white md:block">
            <table className="min-w-full divide-y divide-zinc-200 text-sm">
              <thead className="bg-zinc-50 text-left">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Empresa</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Contacto</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Email</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Teléfono</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Estado</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {clients.map((client, index) => {
                  const tint = getAvatarTint(index);
                  return (
                    <tr className={`hover:bg-zinc-50 ${!client.active ? "opacity-50" : ""}`} key={client.clientId}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${tint.bg} ${tint.text}`}
                          >
                            {getInitials(client.company)}
                          </div>
                          <div>
                            <div className="font-medium text-zinc-900">{client.company}</div>
                            {client.rfc ? <div className="mt-0.5 text-xs text-zinc-400">RFC {client.rfc}</div> : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-600">
                        {client.contactName ?? "—"}
                        {client.contactTitle ? <span className="block text-xs text-zinc-400">{client.contactTitle}</span> : null}
                      </td>
                      <td className="px-4 py-3 text-zinc-600">{client.contactEmail ?? "—"}</td>
                      <td className="px-4 py-3 text-zinc-600">{client.contactPhone ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                            client.active ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${client.active ? "bg-emerald-500" : "bg-zinc-400"}`} />
                          {client.active ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-0.5">
                          <Link
                            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
                            href={`/clientes/${client.clientId}`}
                          >
                            <IconEye className="h-3.5 w-3.5" />
                            Ver 360°
                          </Link>
                          <button
                            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
                            onClick={() => { void openEdit(client); }}
                            type="button"
                          >
                            <IconPencil className="h-3.5 w-3.5" />
                            Editar
                          </button>
                          <button
                            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-teal-50 hover:text-teal-700"
                            onClick={() => { void openTaskModal(client); }}
                            type="button"
                          >
                            <IconCalendarPlus className="h-3.5 w-3.5" />
                            Tarea
                          </button>
                          <button
                            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition ${
                              client.active ? "hover:bg-rose-50 hover:text-rose-700" : "hover:bg-emerald-50 hover:text-emerald-700"
                            }`}
                            onClick={() => { void handleToggleActive(client); }}
                            type="button"
                          >
                            <IconPower className="h-3.5 w-3.5" />
                            {client.active ? "Desactivar" : "Activar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50 px-4 py-2.5">
              <span className="text-xs text-zinc-400">
                {clients.length} {clients.length === 1 ? "cliente" : "clientes"}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3 md:hidden">
            {clients.map((client, index) => {
              const tint = getAvatarTint(index);
              return (
                <div
                  className={`rounded-xl border border-zinc-200 bg-white p-4 ${!client.active ? "opacity-60" : ""}`}
                  key={client.clientId}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${tint.bg} ${tint.text}`}
                      >
                        {getInitials(client.company)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-zinc-900">{client.company}</p>
                        {client.rfc ? <p className="text-xs text-zinc-400">RFC {client.rfc}</p> : null}
                      </div>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                        client.active ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${client.active ? "bg-emerald-500" : "bg-zinc-400"}`} />
                      {client.active ? "Activo" : "Inactivo"}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1 border-t border-zinc-100 pt-3">
                    <p className="text-xs text-zinc-600">
                      {client.contactName ?? "—"}
                      {client.contactTitle ? ` · ${client.contactTitle}` : ""}
                    </p>
                    {client.contactEmail ? (
                      <p className="flex items-center gap-1.5 text-xs text-zinc-500">
                        <IconMail className="h-3 w-3 shrink-0" />
                        <span className="truncate">{client.contactEmail}</span>
                      </p>
                    ) : null}
                    {client.contactPhone ? (
                      <p className="flex items-center gap-1.5 text-xs text-zinc-500">
                        <IconPhone className="h-3 w-3 shrink-0" />
                        {client.contactPhone}
                      </p>
                    ) : null}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Link
                      className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600"
                      href={`/clientes/${client.clientId}`}
                    >
                      <IconEye className="h-3.5 w-3.5" />
                    </Link>
                    <button
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700"
                      onClick={() => { void openEdit(client); }}
                      type="button"
                    >
                      <IconPencil className="h-3.5 w-3.5" />
                      Editar
                    </button>
                    <button
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-teal-700"
                      onClick={() => { void openTaskModal(client); }}
                      type="button"
                    >
                      <IconCalendarPlus className="h-3.5 w-3.5" />
                      Tarea
                    </button>
                    <button
                      className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg border border-zinc-200 ${
                        client.active ? "text-zinc-400" : "text-emerald-600"
                      }`}
                      onClick={() => { void handleToggleActive(client); }}
                      type="button"
                    >
                      <IconPower className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
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
                <label className="mb-1 block text-xs font-medium text-zinc-700">Nombre del contacto</label>
                <input
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                  onChange={(e) => setField("contactFirstName", e.target.value)}
                  placeholder="Nombre"
                  value={form.contactFirstName}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Apellido del contacto</label>
                <input
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                  onChange={(e) => setField("contactLastName", e.target.value)}
                  placeholder="Apellido"
                  value={form.contactLastName}
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
              {editingClient ? (
                <div className="sm:col-span-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-xs font-medium text-zinc-700">Otros contactos</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Directorio adicional de personas en esta cuenta. No sustituye el contacto principal de arriba.
                  </p>
                  {otherContacts.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {otherContacts.map((contact) => (
                        <li
                          className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-700"
                          key={contact.contactId}
                        >
                          <span>
                            <span className="font-medium text-zinc-900">
                              {contact.firstName}
                              {contact.lastName ? ` ${contact.lastName}` : ""}
                            </span>
                            {contact.title ? ` — ${contact.title}` : ""}
                            {contact.email ? ` · ${contact.email}` : ""}
                            {contact.phone ? ` · ${contact.phone}` : ""}
                          </span>
                          <button
                            className="shrink-0 text-rose-600 hover:text-rose-800"
                            onClick={() => { void handleDeleteContact(contact); }}
                            type="button"
                          >
                            Borrar
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-zinc-500">Sin otros contactos registrados.</p>
                  )}
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <input
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                      onChange={(e) => setNewContactFirstName(e.target.value)}
                      placeholder="Nombre *"
                      value={newContactFirstName}
                    />
                    <input
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                      onChange={(e) => setNewContactLastName(e.target.value)}
                      placeholder="Apellido"
                      value={newContactLastName}
                    />
                    <input
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                      onChange={(e) => setNewContactTitle(e.target.value)}
                      placeholder="Cargo"
                      value={newContactTitle}
                    />
                    <input
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                      onChange={(e) => setNewContactEmail(e.target.value)}
                      placeholder="Email"
                      type="email"
                      value={newContactEmail}
                    />
                    <input
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                      onChange={(e) => setNewContactPhone(e.target.value)}
                      placeholder="Teléfono"
                      value={newContactPhone}
                    />
                    <button
                      className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
                      disabled={contactSaving}
                      onClick={() => { void handleAddContact(); }}
                      type="button"
                    >
                      {contactSaving ? "Agregando..." : "Agregar contacto"}
                    </button>
                  </div>
                  {contactMessage ? (
                    <p
                      className={`mt-2 text-xs ${
                        contactMessage.type === "error" ? "text-rose-700" : "text-emerald-700"
                      }`}
                    >
                      {contactMessage.text}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {editingClient ? (
                <div className="sm:col-span-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-xs font-medium text-zinc-700">Historial</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Notas de llamadas, reuniones o correos con esta cuenta. Opcionalmente ligadas a una oportunidad
                    abierta.
                  </p>
                  {interactionLogs.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {interactionLogs.map((interaction) => (
                        <li
                          className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-700"
                          key={interaction.interactionId}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="whitespace-pre-wrap text-zinc-900">{interaction.note}</p>
                            <button
                              className="shrink-0 text-rose-600 hover:text-rose-800"
                              onClick={() => { void handleDeleteInteraction(interaction); }}
                              type="button"
                            >
                              Borrar
                            </button>
                          </div>
                          <p className="mt-1 text-zinc-500">
                            {new Date(interaction.createdAt).toLocaleString("es-MX", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                            {interaction.authorDisplayName ? ` · ${interaction.authorDisplayName}` : ""}
                            {interaction.opportunityNumber ? ` · ${interaction.opportunityNumber}` : ""}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-zinc-500">Sin notas registradas todavía.</p>
                  )}
                  <div className="mt-3 space-y-2">
                    <textarea
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                      onChange={(e) => setNewInteractionNote(e.target.value)}
                      placeholder="Nueva nota..."
                      rows={2}
                      value={newInteractionNote}
                    />
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                      <select
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                        onChange={(e) => setNewInteractionOpportunityId(e.target.value)}
                        value={newInteractionOpportunityId}
                      >
                        <option value="">Sin oportunidad ligada</option>
                        {editOpportunities.map((opp) => (
                          <option key={opp.opportunityId} value={opp.opportunityId}>
                            {opp.opportunityNumber} — {opp.title}
                          </option>
                        ))}
                      </select>
                      <button
                        className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
                        disabled={interactionSaving}
                        onClick={() => { void handleAddInteraction(); }}
                        type="button"
                      >
                        {interactionSaving ? "Agregando..." : "Agregar nota"}
                      </button>
                    </div>
                  </div>
                  {interactionMessage ? (
                    <p
                      className={`mt-2 text-xs ${
                        interactionMessage.type === "error" ? "text-rose-700" : "text-emerald-700"
                      }`}
                    >
                      {interactionMessage.text}
                    </p>
                  ) : null}
                </div>
              ) : null}
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

      {/* Modal nueva tarea */}
      {taskClient ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
              <h2 className="text-base font-semibold text-zinc-900">Nueva tarea — {taskClient.company}</h2>
              <button className="text-zinc-400 hover:text-zinc-700" onClick={closeTaskModal} type="button">
                ✕
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Descripción *</label>
                <textarea
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                  onChange={(e) => setTaskDescription(e.target.value)}
                  placeholder="Ej. Llamar para dar seguimiento"
                  rows={2}
                  value={taskDescription}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Fecha *</label>
                <input
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                  onChange={(e) => setTaskDueDate(e.target.value)}
                  type="date"
                  value={taskDueDate}
                />
              </div>
              {taskOpportunities.length > 0 ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-700">Trato relacionado (opcional)</label>
                  <select
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                    onChange={(e) => setTaskOpportunityId(e.target.value)}
                    value={taskOpportunityId}
                  >
                    <option value="">Sin trato específico</option>
                    {taskOpportunities.map((opp) => (
                      <option key={opp.opportunityId} value={opp.opportunityId}>
                        {opp.opportunityNumber} — {opp.title}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
            {taskMessage ? (
              <div className="px-6 pb-2">
                <p className={`text-sm ${taskMessage.type === "error" ? "text-rose-700" : "text-emerald-700"}`}>
                  {taskMessage.text}
                </p>
              </div>
            ) : null}
            <div className="flex justify-end gap-3 border-t border-zinc-200 bg-white px-6 py-4">
              <button
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                onClick={closeTaskModal}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={taskSaving}
                onClick={() => { void handleSaveTask(); }}
                type="button"
              >
                {taskSaving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
