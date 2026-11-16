"use client";

import { useActionState } from "react";
import { errorMessages } from "@/lib/messages";
import { createShareAction } from "../wunsch-actions";
import { buttonCls, inputCls } from "../ui";

/** Creates the share link of a wish list and shows it exactly once (like the calendar link). */
export function ShareCreate({ listId, exists }: { listId: string; exists: boolean }) {
  const [state, action, pending] = useActionState(createShareAction, null);
  return (
    <div className="space-y-3">
      {state && "url" in state ? (
        <div className="space-y-2" data-testid="share-url">
          <p className="text-sm font-medium">Dein neuer Link (wird nur jetzt angezeigt):</p>
          <input readOnly value={state.url} className={`${inputCls} font-mono text-sm`} aria-label="Link zum Wunschzettel" onFocus={(e) => e.currentTarget.select()} />
        </div>
      ) : null}
      {state && "error" in state ? <p role="alert" className="text-sm text-red-700">{errorMessages[state.error] ?? "Das hat nicht geklappt."}</p> : null}
      <form action={action}>
        <input type="hidden" name="listId" value={listId} />
        <button className={buttonCls} disabled={pending}>{exists || (state && "url" in state) ? "Neuen Link erzeugen (alter wird ungültig)" : "Link zum Teilen erzeugen"}</button>
      </form>
    </div>
  );
}
