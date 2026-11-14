import { activeFamilyId, getSessionUser } from "@/server/session";
import { readImage } from "@/server/services/images";

export const dynamic = "force-dynamic";

const notFound = () => new Response("Nicht gefunden", { status: 404, headers: { "Cache-Control": "no-store" } });

/** Uploaded picture of a recipe or wish. Only for members of the owning family; everything else is a 404. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return notFound();
  const familyId = await activeFamilyId(user);
  if (!familyId) return notFound();
  const { id } = await params;
  if (!/^[a-z0-9]{1,40}$/i.test(id)) return notFound();
  const img = await readImage(user.id, familyId, id);
  if (!img) return notFound();
  return new Response(Buffer.from(img.data), {
    headers: {
      "Content-Type": img.mime,
      "Content-Length": String(img.data.length),
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
