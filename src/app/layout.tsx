import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import type { ReactNode } from "react";
import { analyticsConfig } from "@/server/analytics";
import { activeFamilyId, getSessionUser } from "@/server/session";
import { DEFAULT_MODULES } from "@/server/active-modules";
import { getModules } from "@/server/services/modules";
import { syncAndCount } from "@/server/services/notifications";
import { logoutAction } from "./actions";
import { Bell } from "./bell";
import { Logo, Wortmarke } from "./brand";
import { FeedbackOpenButton, FeedbackWidget } from "./feedback";
import { NavLinks } from "./nav";
import { SwRegister } from "./sw-register";
import { ghostButtonCls } from "./ui";
import "./globals.css";

// Outfit (SIL OFL), self-hosted: the CSP allows fonts from the own origin only.
const outfit = localFont({ src: "./fonts/outfit-variable.woff2", weight: "100 900", variable: "--font-outfit", display: "swap" });

const BRAND = "#C65D3B";

// Absolute URLs (Open Graph image) need the public origin; it is runtime configuration, not baked into the image.
export function generateMetadata(): Metadata {
  let metadataBase: URL | undefined;
  try {
    metadataBase = process.env.BETTER_AUTH_URL ? new URL(process.env.BETTER_AUTH_URL) : undefined;
  } catch {
    metadataBase = undefined;
  }
  return {
    metadataBase,
    title: "Plan4JU",
    description: "Der Familienplaner: Aufgaben, Routinen, Termine, Essen und Einkauf für die ganze Familie.",
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
        { url: "/icon.svg", type: "image/svg+xml" },
      ],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: "Plan4JU", statusBarStyle: "default" },
    openGraph: {
      type: "website",
      siteName: "Plan4JU",
      title: "Plan4JU – die ganze Familienwoche an einem Ort",
      description: "Aufgaben, Routinen, Termine, Essen und Einkauf – für alle sichtbar, für jeden in seiner Farbe.",
      locale: "de_DE",
      images: [{ url: "/og-image.png", width: 1280, height: 640, alt: "Plan4JU: Logo und Illustration eines Hauses mit der Familienwoche" }],
    },
  };
}
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: BRAND };

// Visible without signing in (e.g. on /anmelden), so the deployed version can be checked from outside.
const VERSION = `Plan4JU ${process.env.NEXT_PUBLIC_APP_VERSION ?? ""}`.trim();

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  const analytics = analyticsConfig();
  // Feedback is stored in the active family (RLS); without one the button is hidden instead of failing.
  const familyId = user ? await activeFamilyId(user) : null;
  const hasFamily = Boolean(familyId);
  // Switched-off modules leave the navigation; their pages answer 404 anyway.
  const modules = user && familyId ? await getModules(user.id, familyId) : DEFAULT_MODULES;
  // Notifications are generated lazily here; a failure must never break the page.
  const unread = user && familyId ? await syncAndCount(user.id, familyId).catch(() => 0) : 0;
  return (
    <html lang="de" className={outfit.variable}>
      <body className="min-h-screen antialiased">
        <SwRegister />
        {analytics ? <script defer src={analytics.src} {...(analytics.site ? { "data-site": analytics.site } : {})} /> : null}
        {user ? (
          <div className="md:flex">
            <aside className="hidden md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:gap-1 md:border-r md:border-stone-200 md:bg-white md:p-4">
              <Link href="/" className="mb-4 flex items-center gap-3" aria-label="Plan4JU, zur Startseite">
                <Logo size={36} /> <Wortmarke height={26} />
              </Link>
              <nav aria-label="Hauptmenü" className="flex flex-col gap-1">
                <NavLinks variant="side" modules={modules} />
              </nav>
              <div className="mt-auto flex flex-col gap-2">
                {hasFamily ? <Bell count={unread} withLabel /> : null}
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
                <Link href="/" className="flex items-center gap-2" aria-label="Plan4JU, zur Startseite">
                  <Logo size={28} /> <Wortmarke height={22} />
                </Link>
                <div className="flex items-center gap-1">
                  {hasFamily ? <Bell count={unread} /> : null}
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
              <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
                <Link href="/" className="flex items-center gap-2" aria-label="Plan4JU, zur Startseite">
                  <Logo size={28} /> <Wortmarke height={22} />
                </Link>
              </div>
            </header>
            <main className="mx-auto max-w-5xl px-4 py-6 md:py-10">{children}</main>
            <footer className="mx-auto max-w-5xl px-4 pb-6 text-center text-xs text-stone-400" data-testid="app-version">
              {VERSION}
            </footer>
          </>
        )}
      </body>
    </html>
  );
}
