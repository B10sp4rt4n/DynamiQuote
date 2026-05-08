import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-zinc-50 px-6">
      <div className="w-full max-w-3xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">Cotiza</p>
        <h1 className="mt-3 text-3xl font-semibold text-zinc-900">
          Reconstruccion en Next.js 14 en progreso
        </h1>
        <p className="mt-4 text-zinc-600">
          Esta app migra la logica validada de DynamiQuote a una arquitectura multi-tenant con
          App Router, Prisma y Clerk.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
            href="/cotizaciones"
          >
            Ir a cotizaciones
          </Link>
          <Link className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium" href="/sign-in">
            Iniciar sesion
          </Link>
        </div>
      </div>
    </main>
  );
}
