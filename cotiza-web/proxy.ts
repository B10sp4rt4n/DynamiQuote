import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

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

export default hasClerkCredentials() ? clerkEnabledMiddleware : noopMiddleware;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};