"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { FEEDBACK_KINDS, MAX_IMAGE_BYTES, MAX_MESSAGE, MAX_NAME } from "@/lib/feedback";
import { feedbackAction, type FeedbackState } from "./feedback-actions";
import { buttonCls, inputCls } from "./ui";

/**
 * Feedback form, shown as the tab "Feedback" under Einstellungen (Release 0.8: no floating button any more).
 * The page the person came from is sent along when it is one of ours, so the report still names the page.
 */
export function FeedbackForm() {
  const form = useRef<HTMLFormElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState<FeedbackState, FormData>(feedbackAction, { status: "idle" });
  const [note, setNote] = useState<string | null>(null);

  // The page the person came from (same origin only) and the screen width are read when sending.
  function submit(fd: FormData) {
    let from = "/einstellungen/feedback";
    try {
      const r = document.referrer ? new URL(document.referrer) : null;
      if (r && r.origin === window.location.origin && r.pathname !== window.location.pathname) from = r.pathname.slice(0, 200);
    } catch {
      /* no usable referrer */
    }
    fd.set("seite", from);
    fd.set("breite", String(window.innerWidth));
    action(fd);
  }

  useEffect(() => {
    if (state.status === "ok") form.current?.reset();
  }, [state]);

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setNote(null);
    if (!f) return;
    if (!["image/png", "image/jpeg"].includes(f.type) || f.size > MAX_IMAGE_BYTES) {
      setNote("Bitte nur PNG- oder JPEG-Bilder bis 5 MB.");
      e.target.value = "";
    }
  }

  return (
    <form ref={form} action={submit} className="space-y-4" data-testid="feedback-form">
      <p className="text-sm text-stone-600">Testphase: Sag uns, was fehlt, was hakt oder was dir gefällt.</p>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Art</legend>
        <div className="flex flex-wrap gap-2">
          {Object.entries(FEEDBACK_KINDS).map(([k, label], i) => (
            <label key={k} className="flex min-h-11 items-center gap-2 rounded-xl border border-stone-300 px-3 has-[:checked]:border-terracotta has-[:checked]:bg-orange-50">
              <input type="radio" name="art" value={k} defaultChecked={i === 0} className="accent-terracotta" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Was möchtest du uns sagen?</span>
        <textarea name="text" required maxLength={MAX_MESSAGE} rows={5} className={inputCls} />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Dein Name (optional)</span>
        <input name="name" maxLength={MAX_NAME} autoComplete="name" className={inputCls} />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Bild (optional, PNG oder JPEG bis 5 MB)</span>
        <input ref={fileInput} type="file" name="bild" accept="image/png,image/jpeg" onChange={pickFile} className="max-w-full text-sm" />
      </label>
      {note ? <p className="text-sm text-red-800">{note}</p> : null}

      <p className="text-xs text-stone-600">
        Mitgeschickt werden dein Name (falls angegeben), die zuletzt besuchte Seite, die App-Version, Browser und Gerät grob sowie die Bildschirmbreite.
      </p>
      {state.status === "error" ? <p role="alert" className="text-sm text-red-800">{state.message}</p> : null}
      {state.status === "ok" ? <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800 ring-1 ring-green-200">Danke, ist angekommen!</p> : null}
      <button type="submit" disabled={pending} className={buttonCls}>{pending ? "Sende …" : "Absenden"}</button>
    </form>
  );
}
