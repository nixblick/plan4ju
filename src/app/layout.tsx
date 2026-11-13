import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { getSessionUser } from "@/server/session";
import { logoutAction } from "./actions";
import { ghostButtonCls } from "./ui";
import "./globals.css";

export const metadata: Metadata = { title: "Plan4JU", description: "Der Familienplaner" };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  return (
    <html lang="de">
      <body className="min-h-screen antialiased">
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
            <Link href="/" className="text-lg font-semibold text-terracotta">
              Plan4JU
            </Link>
            {user ? (
              <nav className="flex items-center gap-2 text-sm">
                <Link href="/familie-waehlen" className="px-2 py-2">Familie</Link>
                <Link href="/familie/mitglieder" className="px-2 py-2">Mitglieder</Link>
                <form action={logoutAction}>
                  <button className={ghostButtonCls}>Abmelden</button>
                </form>
              </nav>
            ) : null}
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
