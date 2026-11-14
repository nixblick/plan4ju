import { jobAuthorized } from "@/server/job-auth";
import { refreshDueCalendars } from "@/server/services/calendar";

export const dynamic = "force-dynamic";

/** Background refresh of ICS subscriptions, triggered by an external timer with JOB_TOKEN; without it: 404. */
export async function POST(req: Request) {
  if (!jobAuthorized(req.headers.get("authorization"), process.env.JOB_TOKEN)) return new Response("Nicht gefunden", { status: 404 });
  const result = await refreshDueCalendars();
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
