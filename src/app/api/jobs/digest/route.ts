import { runDigest } from "@/server/digest";
import { jobAuthorized } from "@/server/job-auth";

export const dynamic = "force-dynamic";

/** Daily e-mail digest, triggered by an external timer (cron) with NOTIFY_JOB_TOKEN; without it: 404. */
export async function POST(req: Request) {
  if (!jobAuthorized(req.headers.get("authorization"))) return new Response("Nicht gefunden", { status: 404 });
  const result = await runDigest();
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
