import { SignUp } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { ClientAuthRedirect } from "@/components/auth/client-auth-redirect";
import { CotizaBrand } from "@/components/ui/cotiza-brand";
import { hasClerkCredentials } from "@/lib/auth/clerk";

export default async function SignUpPage() {
  if (!hasClerkCredentials()) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6">
        <section className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-zinc-900">Configura Clerk</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Agrega NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY y CLERK_SECRET_KEY para habilitar el flujo real de registro.
          </p>
        </section>
      </main>
    );
  }

  const { userId } = await auth();

  if (userId) {
    redirect("/cotizaciones");
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.16),_transparent_26%),linear-gradient(180deg,_#fffdf7_0%,_#f8fafc_50%,_#ffffff_100%)] px-6 py-10 text-zinc-900">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center">
        <section className="grid w-full gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[2rem] border border-zinc-200/80 bg-white/90 p-8 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)] backdrop-blur xl:p-12">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Alta de acceso
            </div>

            <div className="mt-6">
              <CotizaBrand href="/" subtitle={null} />
            </div>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight text-zinc-950 md:text-5xl">
              Activa tu acceso y entra a una operación comercial con más control.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-600 md:text-lg">
              El registro te da entrada al flujo completo de cotización, aprobación y propuesta formal.
              Diseñado para equipos B2B que necesitan velocidad sin perder disciplina de rentabilidad.
            </p>
          </div>

          <div className="flex items-center justify-center">
            <div className="w-full max-w-md rounded-[2rem] border border-zinc-200/80 bg-white/90 p-3 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)] backdrop-blur">
              <ClientAuthRedirect target="/cotizaciones" />
              <SignUp
                appearance={{
                  elements: {
                    card: "shadow-none border-0 bg-transparent",
                    footer: "hidden",
                    headerSubtitle: "text-zinc-500",
                    headerTitle: "text-zinc-950",
                    rootBox: "w-full",
                  },
                }}
                fallbackRedirectUrl="/cotizaciones"
                path="/sign-up"
                routing="path"
                signInUrl="/sign-in"
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
