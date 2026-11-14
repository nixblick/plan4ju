// Shared by server action files (this module is NOT a "use server" file, so nothing here is callable from the browser).
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ConflictError, ForbiddenError, ModuleOffError, NotFoundError, RateLimitError } from "@/server/errors";
import { IcsError } from "@/server/ics";
import { FetchError } from "@/server/safe-fetch";
import { requireFamily } from "@/server/session";

export const text = (f: FormData, k: string) => String(f.get(k) ?? "");

/** Fixed, harmless error codes for the address bar. Never the exception text: it can contain a private address. */
export function calendarErrorCode(e: unknown): string {
  if (e instanceof RateLimitError) return "zu-viele";
  if (e instanceof ForbiddenError) return "verboten";
  if (e instanceof ModuleOffError) return "modul-aus";
  if (e instanceof NotFoundError) return "nicht-gefunden";
  if (e instanceof ConflictError) return "kalender-limit";
  if (e instanceof IcsError) return "datei";
  if (e instanceof FetchError) return e.code === "gross" ? "zu-gross" : "adresse";
  if (e instanceof Error && e.name === "ZodError") return "eingabe-plan";
  throw e;
}

export async function runAction(path: string, ok: string, job: (a: Awaited<ReturnType<typeof requireFamily>>) => Promise<string | void>) {
  const active = await requireFamily();
  let failure: string | null = null;
  let done = ok;
  try {
    done = (await job(active)) || ok;
  } catch (e) {
    failure = calendarErrorCode(e);
  }
  revalidatePath("/", "layout");
  redirect(failure ? `${path}?fehler=${failure}` : `${path}?ok=${done}`);
}

/** A local path on this site, else the fallback. */
export const localPath = (p: string, fallback: string) => (p.startsWith("/") && !p.startsWith("//") && !p.includes("\\") ? p : fallback);
