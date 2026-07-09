import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { hasClerkCredentials } from "@/lib/auth/clerk";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cotiza",
  description: "SaaS multi-tenant para cotizaciones y propuestas comerciales",
  icons: {
    icon: "/cotiza-mark.svg",
    shortcut: "/cotiza-mark.svg",
    apple: "/cotiza-mark.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const clerkEnabled = hasClerkCredentials();

  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {clerkEnabled ? (
          <ClerkProvider
            appearance={{
              layout: {
                logoImageUrl: "/cotiza-mark.svg",
              },
              variables: {
                colorPrimary: "#0f172a",
                colorText: "#111827",
                colorBackground: "#ffffff",
                colorInputBackground: "#ffffff",
                colorInputText: "#111827",
                borderRadius: "1rem",
              },
            }}
          >
            {children}
          </ClerkProvider>
        ) : children}
      </body>
    </html>
  );
}
