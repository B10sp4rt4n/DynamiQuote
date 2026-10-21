"use client";

import { useState } from "react";

export function DownloadKpiReportButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/proposals/kpis/pdf", { cache: "no-store" });
      if (!response.ok) throw new Error("No se pudo generar el reporte. Intenta nuevamente.");
      if (!response.headers.get("content-type")?.includes("application/pdf")) throw new Error("La descarga no devolvio un PDF. Inicia sesion e intenta nuevamente.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "Reporte_KPIs.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo descargar el reporte.");
    } finally {
      setPending(false);
    }
  }

  return <div className="mt-2">
    <button
      className="inline-flex min-h-11 items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:cursor-wait disabled:opacity-60"
      type="button" disabled={pending} aria-busy={pending} onClick={download}
    >{pending ? "Generando PDF..." : "Descargar reporte PDF"}</button>
    {error ? <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p> : null}
  </div>;
}
