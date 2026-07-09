import Link from "next/link";
import { CotizaBrand } from "@/components/ui/cotiza-brand";

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(244,114,24,0.16),_transparent_28%),linear-gradient(180deg,_#fffdf7_0%,_#f8fafc_48%,_#ffffff_100%)] px-6 py-10 text-zinc-900">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center">
        <section className="grid w-full gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[2rem] border border-zinc-200/80 bg-white/90 p-8 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)] backdrop-blur xl:p-12">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Anuncio de plataforma
            </div>

            <div className="mt-6">
              <CotizaBrand href="/" subtitle={null} />
            </div>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight text-zinc-950 md:text-5xl">
              Cotización, control de margen y propuesta formal en una sola operación.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-600 md:text-lg">
              Cotiza centraliza el flujo comercial B2B con enfoque real en rentabilidad: calcula
              margen en ambos sentidos, gobierna autorizaciones internas y convierte cotizaciones en
              propuestas listas para enviar.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <span className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700">
                Multi-tenant real
              </span>
              <span className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700">
                PDF + Excel + email
              </span>
              <span className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700">
                Aprobación por política de margen
              </span>
            </div>

            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                className="rounded-xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
                href="/cotizaciones"
              >
                Entrar al cotizador
              </Link>
              <Link
                className="rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 transition hover:border-zinc-400 hover:bg-zinc-50"
                href="/sign-in"
              >
                Iniciar sesión
              </Link>
            </div>

            <div className="mt-10 grid gap-4 border-t border-zinc-200 pt-8 md:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Posicionamiento</p>
                <p className="mt-2 text-sm leading-6 text-zinc-700">
                  CPQ vertical para operación comercial mexicana.
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Valor central</p>
                <p className="mt-2 text-sm leading-6 text-zinc-700">
                  Velocidad comercial con disciplina de margen.
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Estado</p>
                <p className="mt-2 text-sm leading-6 text-zinc-700">
                  Plataforma activa sobre Next.js 14, Prisma y Neon.
                </p>
              </div>
            </div>
          </div>

          <aside className="grid gap-5">
            <article className="rounded-[2rem] border border-zinc-200 bg-zinc-950 p-8 text-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Mensaje principal</p>
              <h2 className="mt-3 text-2xl font-semibold leading-tight">
                No es un generador de documentos. Es gobierno comercial con salida operativa.
              </h2>
              <p className="mt-4 text-sm leading-7 text-zinc-300">
                El diferencial no está en “hacer propuestas bonitas”, sino en decidir mejor qué se
                puede enviar, con qué margen y bajo qué nivel de autorización.
              </p>
            </article>

            <article className="rounded-[2rem] border border-zinc-200 bg-white p-8 shadow-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Qué resuelve</p>
              <div className="mt-5 space-y-4">
                <div className="rounded-xl bg-zinc-50 p-4">
                  <p className="text-sm font-semibold text-zinc-900">Cotización con rentabilidad</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-600">
                    Precio desde margen o margen desde precio, sin romper la lógica comercial.
                  </p>
                </div>
                <div className="rounded-xl bg-zinc-50 p-4">
                  <p className="text-sm font-semibold text-zinc-900">Autorización con política</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-600">
                    Control de propuestas fuera de rango antes de que salgan al cliente.
                  </p>
                </div>
                <div className="rounded-xl bg-zinc-50 p-4">
                  <p className="text-sm font-semibold text-zinc-900">Salida formal inmediata</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-600">
                    Propuesta, PDF y operación documental sin depender de hojas sueltas.
                  </p>
                </div>
              </div>
            </article>
          </aside>
        </section>
      </div>
    </main>
  );
}
