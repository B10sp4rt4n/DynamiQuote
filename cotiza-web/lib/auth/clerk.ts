export function hasClerkCredentials(): boolean {
  return Boolean(
    process.env["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] && process.env["CLERK_SECRET_KEY"],
  );
}