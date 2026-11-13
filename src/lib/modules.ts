import { z } from "zod";
import { httpsUrl } from "./wishes";

/** Optional modules of Release 0.5 (docs/module.md). Off by default, switched per family by admins. */
export const MODULES = {
  flyers: { label: "Prospekte", description: "Links zu den Prospekten der Händler, unter Einkauf." },
  waste: { label: "Abfallkalender", description: "Nächste Abfuhrtermine aus einem eigenen Kalender (ICS), im Kalender und auf der Startseite." },
} as const;
export type ModuleKey = keyof typeof MODULES;
export const isModuleKey = (k: string): k is ModuleKey => k === "flyers" || k === "waste";

export interface FlyerLink {
  id: string;
  name: string;
  url: string;
  active: boolean;
}

export const FLYER_MAX = 20;
export const FLYER_NAME_MAX = 60;

/**
 * Starting list when the module is first switched on: the retailers named in the concept, linked to their
 * own websites (no scraping, no embedding). Admins change the address to the flyer page they use.
 */
export const DEFAULT_FLYERS: Omit<FlyerLink, "id">[] = [
  { name: "Aldi Süd", url: "https://www.aldi-sued.de/", active: true },
  { name: "Lidl", url: "https://www.lidl.de/", active: true },
  { name: "Edeka", url: "https://www.edeka.de/", active: true },
  { name: "Rewe", url: "https://www.rewe.de/", active: true },
  { name: "Netto", url: "https://www.netto-online.de/", active: true },
];

/** Official website of the Frankfurt waste service; there is no documented ICS or API (docs/module.md). */
export const WASTE_INFO_URL = "https://www.fes-frankfurt.de/";

export const flyerInput = z.object({
  name: z.string().trim().min(1).max(FLYER_NAME_MAX),
  url: z.string().trim().max(2000).transform((u, c) => {
    const ok = httpsUrl(u);
    if (!ok) c.addIssue({ code: "custom", message: "https only" });
    return ok ?? "";
  }),
});

const stored = z.array(z.object({ id: z.string(), name: z.string(), url: z.string(), active: z.boolean() }));

/** Reads the JSON column defensively: anything malformed or not https is dropped. */
export function parseFlyers(raw: unknown): FlyerLink[] {
  const r = stored.safeParse(raw);
  if (!r.success) return [];
  return r.data.filter((f) => httpsUrl(f.url) === f.url).slice(0, FLYER_MAX);
}
