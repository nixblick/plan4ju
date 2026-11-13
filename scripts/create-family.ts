// Instance administration: create a family and invite its first owner.
//   npm run admin:create-family -- --name "Familie Muster" --owner owner@example.test [--send]
// Uses the table owner connection (DATABASE_ADMIN_URL). The invitation link is printed once.
import { PrismaClient } from "@prisma/client";
import { createFamilyWithOwnerInvitation } from "../src/server/admin";
import { baseUrl } from "../src/server/env";
import { sendMail } from "../src/server/mail";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const name = arg("name");
  const ownerEmail = arg("owner");
  if (!name || !ownerEmail) {
    console.error('Usage: create-family --name "Familie Muster" --owner owner@example.test [--send]');
    process.exit(2);
  }
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) throw new Error("DATABASE_ADMIN_URL is not set");
  const owner = new PrismaClient({ datasourceUrl: url });
  try {
    const r = await createFamilyWithOwnerInvitation(owner, { name, ownerEmail });
    const link = `${baseUrl()}/einladung/${r.token}`;
    console.log(`Family created: ${r.familyId}`);
    console.log(`Invitation for ${r.email} (valid until ${r.expiresAt.toISOString()}):`);
    console.log(link);
    if (process.argv.includes("--send")) {
      await sendMail({
        to: r.email,
        subject: "Einladung zu Plan4JU",
        text: `Du wurdest als Owner der Familie „${name}“ zu Plan4JU eingeladen (7 Tage gültig, einmal verwendbar):\n${link}\n`,
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
