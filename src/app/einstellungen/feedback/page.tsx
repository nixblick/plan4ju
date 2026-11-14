import { FeedbackForm } from "../../feedback";
import { requireFamily } from "@/server/session";
import { Card } from "../../ui";
import { EinstellungenTabs } from "../tabs";

export const dynamic = "force-dynamic";

/** Feedback as a tab of the settings (Release 0.8); it is stored in the active family. */
export default async function FeedbackSeite() {
  await requireFamily();
  return (
    <div className="space-y-6">
      <EinstellungenTabs active="feedback" />
      <h1 className="text-2xl font-bold">Feedback</h1>
      <Card title="Feedback geben">
        <FeedbackForm />
      </Card>
    </div>
  );
}
