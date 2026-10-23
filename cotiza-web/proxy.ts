import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";

import { hasClerkCredentials } from "@/lib/auth/clerk";

const DEV_CLERK_SESSION_COOKIE = "dev_clerk_client_session";

const isProtectedRoute = createRouteMatcher([
  "/cotizaciones(.*)",
  "/propuestas(.*)",
  "/paquetes(.*)",
  "/configuracion(.*)",
]);

const noopMiddleware = () => NextResponse.next();

const clerkEnabledMiddleware = clerkMiddleware(async (auth, request) => {
  if (!isProtectedRoute(request)) {
    return NextResponse.next();
  }

  const { userId } = await auth();
  const hasDevClientSession =
    process.env.NODE_ENV === "development" && request.cookies.get(DEV_CLERK_SESSION_COOKIE)?.value === "1";

  if (!userId && !hasDevClientSession) {
    const signInUrl = new URL("/sign-in", request.url);
    const returnPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    signInUrl.searchParams.set("redirect_url", returnPath);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

const authenticatedMiddleware = hasClerkCredentials() ? clerkEnabledMiddleware : noopMiddleware;

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  // Pause the whole application before auth or any route, including GET routes
  // with side effects and signed webhooks. Only an absent flag or "off" opens it.
  const mode = process.env["CRM_MAINTENANCE_MODE"]?.trim();
  if (mode && mode !== "off") {
    return NextResponse.json(
      { error: "CRM temporalmente en mantenimiento. Intenta nuevamente mas tarde.", code: "CRM_MAINTENANCE" },
      { status: 503, headers: { "Retry-After": "300", "Cache-Control": "no-store" } },
    );
  }
  return authenticatedMiddleware(request, event);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
    "/(api|trpc)(.*)",
  ],
};
