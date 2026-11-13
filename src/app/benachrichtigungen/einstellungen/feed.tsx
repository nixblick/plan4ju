"use client";

import { useActionState } from "react";
import { createFeedAction } from "../../benachrichtigung-actions";
import { buttonCls, inputCls } from "../../ui";

export function FeedCreate({ exists }: { exists: boolean }) {
  const [state, action, pending] = useActionState(createFeedAction, null);
  return (
    <div className="space-y-3">
      {state ? (
        <div className="space-y-2" data-testid="feed-url">
          <p className="text-sm font-medium">Dein neuer Link (wird nur jetzt angezeigt):</p>
          <input readOnly value={state.url} className={`${inputCls} font-mono text-sm`} aria-label="Kalender-Link" onFocus={(e) => e.currentTarget.select()} />
          <p className="text-sm text-stone-600">In der Kalender-App „Kalender abonnieren“ bzw. „Per URL hinzufügen“ wählen und den Link einfügen. Wer den Link hat, sieht die Termine: nicht weitergeben.</p>
        </div>
      ) : null}
      <form action={action}>
        <button className={buttonCls} disabled={pending}>{exists || state ? "Neuen Link erzeugen (alter wird ungültig)" : "Kalender-Link erzeugen"}</button>
      </form>
    </div>
  );
}
