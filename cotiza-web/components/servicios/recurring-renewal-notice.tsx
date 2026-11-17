import type { RecurringRenewalReview } from "@/lib/domain/recurring-services";

const labels: Record<RecurringRenewalReview["state"], string> = {
  draft: "Vigencia pendiente de activación",
  ended: "Acuerdo terminado · historial conservado",
  incomplete: "Completar vigencia contractual",
  open_ended: "Sin fecha de fin pactada",
  scheduled: "Contrato con inicio futuro",
  expired: "Vigencia contractual cumplida · revisar continuidad",
  t30: "Renovación · próximos 30 días",
  t60: "Renovación · entre 31 y 60 días",
  notice_due: "Revisar preaviso contractual",
  current: "Fin contractual a más de 60 días",
};

function day(value: string) {
  const [year, month, date] = value.split("-");
  return `${date}/${month}/${year}`;
}

export function RecurringRenewalNotice({ review }: { review: RecurringRenewalReview }) {
  const color = ["expired", "t30"].includes(review.state)
    ? "border-red-300 bg-red-50 text-red-950"
    : ["t60", "notice_due", "incomplete"].includes(review.state)
      ? "border-amber-300 bg-amber-50 text-amber-950"
      : "border-zinc-300 bg-zinc-50 text-zinc-800";
  return (
    <div className={`mt-3 space-y-1 rounded-lg border p-3 text-sm ${color}`}>
      <p className="font-semibold">{labels[review.state]}</p>
      {review.lastCoveredOn && review.endsOn ? (
        <p>Último día del contrato: {day(review.lastCoveredOn)}. Primer día fuera de vigencia: {day(review.endsOn)}.</p>
      ) : null}
      {review.noticeOn ? <p>Preaviso: {day(review.noticeOn)}{review.noticeDue ? " · revisar plazo pactado" : ""}.</p> : null}
      {review.autoRenew === true && !["draft", "ended"].includes(review.state)
        ? <p>Renovación automática pactada; confirmar continuidad y condiciones.</p> : null}
      <p className="text-xs">Consulta: {day(review.asOf)} · {review.timezone}.</p>
    </div>
  );
}
