import { SignUp } from "@clerk/nextjs";

import { hasClerkCredentials } from "@/lib/auth/clerk";

export default function SignUpPage() {
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

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6">
      <SignUp forceRedirectUrl="/cotizaciones" path="/sign-up" routing="path" signInUrl="/sign-in" />
    </main>
  );
}
