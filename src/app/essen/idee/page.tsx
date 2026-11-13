import { aiEnabled } from "@/server/ai/recipe-ideas";
import { requireFamily } from "@/server/session";
import { createRecipeAction } from "../../rezepte-actions";
import { Notice } from "../../ui";
import { EssenTabs } from "../tabs";
import { IdeaAndForm } from "./idea-form";
import { pageModule } from "@/server/active-modules";

export const dynamic = "force-dynamic";

export default async function Rezeptidee() {
  await pageModule("meals");
  await requireFamily();
  const enabled = aiEnabled();
  return (
    <div className="space-y-6">
      <EssenTabs active="idee" />
      <h1 className="text-2xl font-bold">Rezeptidee</h1>
      {enabled ? (
        <IdeaAndForm action={createRecipeAction} />
      ) : (
        <Notice kind="error">
          Rezeptideen per KI sind auf diesem Server nicht eingerichtet. Alles andere funktioniert ohne sie; Rezepte kannst du von Hand eintragen oder von einer Webseite übernehmen.
        </Notice>
      )}
    </div>
  );
}
