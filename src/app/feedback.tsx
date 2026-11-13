"use client";

import { usePathname } from "next/navigation";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { FEEDBACK_KINDS, MAX_IMAGE_BYTES, MAX_MESSAGE, MAX_NAME } from "@/lib/feedback";
import { feedbackAction, type FeedbackState } from "./feedback-actions";
import { buttonCls, ghostButtonCls, inputCls } from "./ui";

const OPEN_EVENT = "plan4ju:feedback-open";

/** Any button that opens the feedback form (menu entry, dashboard tile). */
export function FeedbackOpenButton({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}>
      {children}
    </button>
  );
}

const bubble = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z" />
    <path d="M8.5 11h7M8.5 14h4" />
  </svg>
);

async function captureScreen(): Promise<Blob | null> {
  const { default: html2canvas } = await import("html2canvas-pro");
  const canvas = await html2canvas(document.body, {
    logging: false,
    scale: Math.min(window.devicePixelRatio || 1, 2),
    x: window.scrollX,
    y: window.scrollY,
    width: window.innerWidth,
    height: window.innerHeight,
    ignoreElements: (el) => el instanceof HTMLElement && el.dataset.feedbackIgnore === "true",
  });
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

/** Floating "Feedback" button plus the form dialog. Rendered once in the layout for signed-in users. */
export function FeedbackWidget() {
  const path = usePathname() ?? "/";
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState<FeedbackState, FormData>(feedbackAction, { status: "idle" });
  const [shot, setShot] = useState<File | null>(null);
  const [shotBusy, setShotBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [dismissedAt, setDismissedAt] = useState<number | undefined>(undefined);
  const thanks = state.status === "ok" && state.at !== dismissedAt;
  const [width, setWidth] = useState("");

  const open = () => {
    setNote(null);
    setWidth(String(window.innerWidth));
    dialog.current?.showModal();
  };

  useEffect(() => {
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);

  useEffect(() => {
    if (state.status !== "ok") return;
    dialog.current?.close();
    form.current?.reset();
    const t = setTimeout(() => setDismissedAt(state.at), 6000);
    return () => clearTimeout(t);
  }, [state]);

  async function takeShot() {
    setShotBusy(true);
    setNote(null);
    dialog.current?.close();
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const blob = await captureScreen();
      if (!blob) throw new Error("no image");
      if (blob.size > MAX_IMAGE_BYTES) throw new Error("too large");
      setShot(new File([blob], "screenshot.png", { type: "image/png" }));
      if (fileInput.current) fileInput.current.value = "";
    } catch {
      setNote("Die Seite ließ sich nicht aufnehmen. Du kannst stattdessen ein eigenes Bild anhängen.");
    } finally {
      setShotBusy(false);
      dialog.current?.showModal();
    }
  }

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setNote(null);
    if (!f) return;
    if (!["image/png", "image/jpeg"].includes(f.type) || f.size > MAX_IMAGE_BYTES) {
      setNote("Bitte nur PNG- oder JPEG-Bilder bis 5 MB.");
      e.target.value = "";
      return;
    }
    setShot(null);
  }

  function submit(fd: FormData) {
    if (shot) fd.set("bild", shot);
    setShot(null);
    action(fd);
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        data-feedback-ignore="true"
        data-testid="feedback-button"
        className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 inline-flex min-h-12 items-center gap-2 rounded-full bg-terracotta px-4 py-2 font-semibold text-white shadow-lg ring-2 ring-white hover:bg-terracotta-dark md:bottom-6 md:right-6"
      >
        {bubble}
        <span>Feedback</span>
      </button>

      {thanks ? (
        <p
          role="status"
          data-feedback-ignore="true"
          className="fixed inset-x-4 bottom-[calc(8.5rem+env(safe-area-inset-bottom))] z-20 mx-auto max-w-sm rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800 shadow-lg ring-1 ring-green-200 md:bottom-24"
        >
          Danke, ist angekommen!
        </p>
      ) : null}

      <dialog
        ref={dialog}
        aria-labelledby="feedback-title"
        data-feedback-ignore="true"
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl bg-white p-0 shadow-xl backdrop:bg-stone-900/40"
      >
        <form ref={form} action={submit} className="p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <h2 id="feedback-title" className="text-lg font-semibold">Feedback geben</h2>
            <button type="button" onClick={() => dialog.current?.close()} className="-m-2 p-2 text-stone-600" aria-label="Schließen">✕</button>
          </div>
          <p className="mb-4 text-sm text-stone-600">Testphase: Sag uns, was fehlt, was hakt oder was dir gefällt.</p>

          <fieldset className="mb-4">
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

          <label className="mb-4 block">
            <span className="mb-1 block text-sm font-medium">Was möchtest du uns sagen?</span>
            <textarea name="text" required maxLength={MAX_MESSAGE} rows={5} className={inputCls} />
          </label>

          <label className="mb-4 block">
            <span className="mb-1 block text-sm font-medium">Dein Name (optional)</span>
            <input name="name" maxLength={MAX_NAME} autoComplete="name" className={inputCls} />
          </label>

          <div className="mb-4 space-y-2">
            <p className="text-sm font-medium">Bild (optional)</p>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={takeShot} disabled={shotBusy} className={ghostButtonCls}>
                {shotBusy ? "Nehme auf …" : "Diese Seite aufnehmen"}
              </button>
              <label className="text-sm">
                <span className="sr-only">Eigenes Bild (PNG oder JPEG, bis 5 MB)</span>
                <input ref={fileInput} type="file" name="bild" accept="image/png,image/jpeg" onChange={pickFile} className="max-w-full text-sm" />
              </label>
            </div>
            {shot ? (
              <p className="text-sm text-green-800">
                Aufnahme angehängt ({Math.round(shot.size / 1024)} KB).{" "}
                <button type="button" className="underline" onClick={() => setShot(null)}>Entfernen</button>
              </p>
            ) : null}
            {note ? <p className="text-sm text-red-800">{note}</p> : null}
          </div>

          <input type="hidden" name="seite" value={path} />
          <input type="hidden" name="breite" value={width} />
          <p className="mb-4 text-xs text-stone-600">
            Mitgeschickt werden dein Name (falls angegeben), die Seite, die App-Version, Browser und Gerät grob sowie die Bildschirmbreite.
          </p>
          {state.status === "error" ? <p role="alert" className="mb-3 text-sm text-red-800">{state.message}</p> : null}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => dialog.current?.close()} className={ghostButtonCls}>Abbrechen</button>
            <button type="submit" disabled={pending} className={buttonCls}>{pending ? "Sende …" : "Absenden"}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
