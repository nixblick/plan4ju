import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { analyticsConfig } from "@/server/analytics";
import { activeFamilyId, getSessionUser } from "@/server/session";
import { DEFAULT_MODULES } from "@/server/active-modules";
import { getModules } from "@/server/services/modules";
import { logoutAction } from "./actions";
import { FeedbackOpenButton, FeedbackWidget } from "./feedback";
import { NavLinks } from "./nav";
import { SwRegister } from "./sw-register";
import { ghostButtonCls } from "./ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "Plan4JU",
  description: "Der Familienplaner",
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Plan4JU", statusBarStyle: "default" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#c8553d" };

// Visible without signing in (e.g. on /anmelden), so the deployed version can be checked from outside.
const VERSION = `Plan4JU ${process.env.NEXT_PUBLIC_APP_VERSION ?? ""}`.trim();

function Logo({ size }: { size: number }) {
  return <Image src="/logo.svg" alt="" width={size} height={size} unoptimized className="rounded-lg" />;
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  const analytics = analyticsConfig();
  // Feedback is stored in the active family (RLS); without one the button is hidden instead of failing.
  const familyId = user ? await activeFamilyId(user) : null;
  const hasFamily = Boolean(familyId);
  // Switched-off modules leave the navigation; their pages answer 404 anyway.
  const modules = user && familyId ? await getModules(user.id, familyId) : DEFAULT_MODULES;
  return (
    <html lang="de">
      <body className="min-h-screen antialiased">
        <SwRegister />
        {analytics ? <script defer src={analytics.src} {...(analytics.site ? { "data-site": analytics.site } : {})} /> : null}
        {user ? (
          <div className="md:flex">
            <aside className="hidden md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:gap-1 md:border-r md:border-stone-200 md:bg-white md:p-4">
              <Link href="/" className="mb-4 flex items-center gap-3 text-xl font-semibold text-terracotta">
                <Logo size={36} /> Plan4JU
              </Link>
              <nav aria-label="Hauptmenü" className="flex flex-col gap-1">
                <NavLinks variant="side" modules={modules} />
              </nav>
              <div className="mt-auto flex flex-col gap-2">
                {hasFamily ? <FeedbackOpenButton className="px-3 py-2 text-left text-sm text-stone-600 underline">Feedback geben</FeedbackOpenButton> : null}
                <Link href="/konto" className="px-3 py-2 text-sm text-stone-600 underline">
                  Konto
                </Link>
                <Link href="/familie-waehlen" className="px-3 py-2 text-sm text-stone-600 underline">
                  Familie wechseln
                </Link>
                <form action={logoutAction}>
                  <button className={`${ghostButtonCls} w-full`}>Abmelden</button>
                </form>
                <p className="px-3 text-xs text-stone-400" data-testid="app-version">{VERSION}</p>
              </div>
            </aside>
            <div className="min-w-0 flex-1">
              <header className="flex items-center justify-between gap-3 border-b border-stone-200 bg-white px-4 py-2 md:hidden">
                <Link href="/" className="flex items-center gap-2 text-lg font-semibold text-terracotta">
                  <Logo size={28} /> Plan4JU
                </Link>
                <div className="flex items-center gap-2">
                  <Link href="/konto" className="inline-flex min-h-11 items-center px-2 text-sm text-stone-600 underline">Konto</Link>
                  <form action={logoutAction}>
                    <button className={ghostButtonCls}>Abmelden</button>
                  </form>
                </div>
              </header>
              <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8">
                {children}
                <p className="mt-8 text-center text-xs text-stone-400 md:hidden">{VERSION}</p>
              </main>
            </div>
            <nav
              aria-label="Hauptmenü"
              className="fixed inset-x-0 bottom-0 z-10 flex border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
            >
              <NavLinks variant="tabs" modules={modules} />
            </nav>
            {hasFamily ? <FeedbackWidget /> : null}
          </div>
        ) : (
          <>
            <header className="border-b border-stone-200 bg-white">
              <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
                <Link href="/" className="flex items-center gap-2 text-lg font-semibold text-terracotta">
                  <Logo size={28} /> Plan4JU
                </Link>
              </div>
            </header>
            <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
            <footer className="mx-auto max-w-3xl px-4 pb-6 text-center text-xs text-stone-400" data-testid="app-version">
              {VERSION}
            </footer>
          </>
        )}
      </body>
    </html>
  );
}
