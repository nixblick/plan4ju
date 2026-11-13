import Link from "next/link";
import { errorMessages, one } from "@/lib/messages";
import { requireFamily } from "@/server/session";
import { createRecipeAction } from "../../rezepte-actions";
import { Notice } from "../../ui";
import { ImportAndForm } from "../recipe-form";

export const dynamic = "force-dynamic";

export default async function NeuesRezept({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireFamily();
  const fehler = one((await searchParams).fehler);
  return (
    <div className="space-y-6">
      <Link href="/rezepte" className="text-sm text-terracotta-dark underline">← Alle Rezepte</Link>
      <h1 className="text-2xl font-bold">Neues Rezept</h1>
      {fehler ? <Notice kind="error">{fehler === "eingabe-plan" ? "Bitte prüfe deine Eingaben (Titel fehlt, Menge oder Link ungültig; Links nur mit https)." : errorMessages[fehler] ?? "Das hat nicht geklappt."}</Notice> : null}
      <ImportAndForm action={createRecipeAction} />
    </div>
  );
}
