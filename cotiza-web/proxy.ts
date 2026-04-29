import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { hasClerkCredentials } from "@/lib/auth/clerk";

const isProtectedRoute = createRouteMatcher([
  "/cotizaciones(.*)",
  "/propuestas(.*)",
  "/paquetes(.*)",
  "/configuracion(.*)",
]);

const noopMiddleware = () => NextResponse.next();

const clerkEnabledMiddleware = clerkMiddleware(async (auth, request) => {
  if (isProtectedRoute(request)) {
    await auth.protect();
  }
});

export default hasClerkCredentials() ? clerkEnabledMiddleware : noopMiddleware;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};