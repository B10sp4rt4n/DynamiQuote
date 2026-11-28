import type { CustomerEmail } from "@/lib/domain/customer-email";

export function CustomerEmailSummary({ email }: { email: CustomerEmail }) {
  return <div className="space-y-2 rounded-lg border border-zinc-300 bg-white p-3 text-sm text-zinc-900">
    <p className="font-semibold">Datos leídos del correo adjunto</p>
    <p className="break-words"><strong>Remitente:</strong> {email.senderName ?? "Nombre por confirmar"}{email.senderEmail ? ` <${email.senderEmail}>` : " · correo por confirmar"}</p>
    <p><strong>Fecha de envío:</strong> {email.sentAt ? `${new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(email.sentAt))} · Ciudad de México` : "Por confirmar"}</p>
    <p className="break-words"><strong>Asunto:</strong> {email.subject || "Sin asunto"}</p>
    <details className="rounded-lg bg-zinc-50 p-2">
      <summary className="min-h-11 cursor-pointer py-2 font-medium">Ver respuesta original y contexto del hilo</summary>
      <p className="mt-2 font-semibold">Respuesta del remitente</p>
      <p className="mt-1 whitespace-pre-wrap break-words">{email.replyText || "No se pudo extraer el texto. Consulta el archivo original."}</p>
      {email.quotedContext ? <><p className="mt-3 font-semibold">Contexto citado en la respuesta</p><p className="mt-1 whitespace-pre-wrap break-words">{email.quotedContext}</p></> : null}
    </details>
    {email.warnings.length ? <ul className="list-disc space-y-1 rounded-lg bg-amber-50 p-3 pl-7 text-amber-950">{email.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul> : null}
    <p className="text-xs text-zinc-700">Datos tomados del archivo. Revisa que la respuesta corresponda a esta propuesta antes de registrar la aceptación.</p>
  </div>;
}
