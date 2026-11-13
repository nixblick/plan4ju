// Instance administration: create a family and invite its first owner.
//   npm run admin:create-family -- --name "Familie Muster" --owner owner@example.test [--send]
//   npm run admin:create-family -- --family <familyId> --owner owner@example.test [--send]   (new invitation, existing family)
// --send refuses a localhost link unless --allow-localhost is given (BETTER_AUTH_URL must be the public URL).
// Uses the table owner connection (DATABASE_ADMIN_URL). The invitation link is printed once.
import { PrismaClient } from "@prisma/client";
import { createFamilyWithOwnerInvitation, inviteOwnerToFamily } from "../src/server/admin";
import { baseUrl } from "../src/server/env";
import { sendMail } from "../src/server/mail";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const name = arg("name");
  const familyId = arg("family");
  const ownerEmail = arg("owner");
  if ((!name && !familyId) || (name && familyId) || !ownerEmail) {
    console.error('Usage: create-family (--name "Familie Muster" | --family <id>) --owner owner@example.test [--send] [--allow-localhost]');
    process.exit(2);
  }
  const send = process.argv.includes("--send");
  if (send && /^https?:\/\/(localhost|127\.|\[::1\])/i.test(baseUrl()) && !process.argv.includes("--allow-localhost")) {
    console.error(`Refusing to send: invitation link would point to ${baseUrl()}. Set BETTER_AUTH_URL to the public URL.`);
    process.exit(2);
  }
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) throw new Error("DATABASE_ADMIN_URL is not set");
  const owner = new PrismaClient({ datasourceUrl: url });
  try {
    const r = familyId
      ? await inviteOwnerToFamily(owner, { familyId, ownerEmail })
      : { ...(await createFamilyWithOwnerInvitation(owner, { name: name as string, ownerEmail })), familyName: name as string };
    const link = `${baseUrl()}/einladung/${r.token}`;
    console.log(familyId ? `New invitation for family: ${r.familyId}` : `Family created: ${r.familyId}`);
    console.log(`Invitation for ${r.email} (valid until ${r.expiresAt.toISOString()}):`);
    console.log(link);
    if (send) {
      await sendMail({
        to: r.email,
        subject: "Einladung zu Plan4JU",
        text: `Du wurdest als Owner der Familie „${r.familyName}“ zu Plan4JU eingeladen (7 Tage gültig, einmal verwendbar):\n${link}\n`,
      });
      console.log("Mail sent.");
    }
  } finally {
    await owner.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
