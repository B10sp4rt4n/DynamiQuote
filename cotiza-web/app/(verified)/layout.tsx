import type { Metadata } from "next";
import { CotizaBrand } from "@/components/ui/cotiza-brand";
export const metadata: Metadata = { referrer: "no-referrer", robots: { index: false, follow: false } };
export default function VerifiedLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-zinc-100"><header className="border-b border-zinc-200 bg-white px-4 py-4"><div className="mx-auto max-w-4xl"><CotizaBrand href="/autorizacion-verificable" subtitle="SynAppsSys · Autorización verificable" /></div></header><main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">{children}</main></div>;
}
