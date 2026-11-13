import type { PrismaClient } from "@prisma/client";
import { baseUrl } from "./env";
import { sendMail } from "./mail";
import { claimDigests, digestFor } from "./services/notifications";

/** Runs the daily e-mail digest once (docs/benachrichtigungen.md). Safe to call repeatedly per day. */
export async function runDigest(now: Date = new Date(), client?: PrismaClient, send: typeof sendMail = sendMail) {
  const day = now.toISOString().slice(0, 10);
  const claimed = await claimDigests(day, client);
  let sent = 0;
  let failed = 0;
  for (const c of claimed) {
    try {
      const d = await digestFor(c.userId, c.familyId, now, client);
      if (!d) continue;
      await send({
        to: d.email,
        subject: `Plan4JU: ${d.titles.length} ${d.titles.length === 1 ? "Erinnerung" : "Erinnerungen"} (${d.familyName})`,
        text: [
          `Guten Morgen! Das steht heute in der Familie „${d.familyName}“ an:`,
          "",
          ...d.titles.map((t) => `- ${t}`),
          "",
          `Alles ansehen: ${baseUrl()}/benachrichtigungen`,
          `Diese E-Mail abschalten: ${baseUrl()}/benachrichtigungen/einstellungen`,
        ].join("\n"),
      });
      sent++;
    } catch (e) {
      failed++;
      console.error("digest failed", e instanceof Error ? e.name : "error");
    }
  }
  return { claimed: claimed.length, sent, failed };
}
