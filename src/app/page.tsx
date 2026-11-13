import Link from "next/link";
import { redirect } from "next/navigation";
import { listFamiliesForUser } from "@/server/services/families";
import { requireFamily, requireUser } from "@/server/session";
import { Card } from "./ui";

export default async function Home() {
  await requireUser();
  const { user, familyId } = await requireFamily();
  const families = await listFamiliesForUser(user.id);
  const family = families.find((f) => f.family.id === familyId);
  if (!family) redirect("/familie-waehlen");
  return (
    <Card title={`Hallo ${user.name}`}>
      <p className="mb-3">
        Aktive Familie: <strong>{family.family.name}</strong>
      </p>
      <p className="mb-4 text-sm text-stone-600">Das Wochen-Dashboard folgt in einem der nächsten Schritte.</p>
      <Link href="/familie/mitglieder" className="text-terracotta underline">
        Mitglieder und Einladungen
      </Link>
    </Card>
  );
}
