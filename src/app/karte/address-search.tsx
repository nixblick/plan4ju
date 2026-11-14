"use client";

import { useRef, useState } from "react";
import { ghostButtonCls, inputCls } from "../ui";

export const MAP_PICK_EVENT = "plan4ju:map-pick";

interface Result {
  label: string;
  lat: number;
  lng: number;
}

/**
 * Address search and "Mein Standort" for the POI form. The search runs on the own server (which asks
 * Nominatim, docs/karte.md) and only on request: button or Enter, from 3 characters, no search while typing
 * (the Nominatim usage policy forbids autocomplete). The location comes from the browser, only on click,
 * and is only written into the form fields, never stored on its own.
 */
export function AddressSearch({ idPrefix }: { idPrefix: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const last = useRef(0);

  function apply(lat: number, lng: number, label?: string) {
    const set = (id: string, v: string) => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (el) el.value = v;
    };
    set(`${idPrefix}-lat`, lat.toFixed(6));
    set(`${idPrefix}-lng`, lng.toFixed(6));
    if (label) set(`${idPrefix}-address`, label.slice(0, 300));
    window.dispatchEvent(new CustomEvent(MAP_PICK_EVENT, { detail: { lat, lng } }));
  }

  async function search() {
    const text = q.trim();
    if (text.length < 3) {
      setMsg("Bitte mindestens 3 Zeichen eingeben.");
      return;
    }
    // debounce: a second click or Enter within a second is ignored
    const now = Date.now();
    if (busy || now - last.current < 1000) return;
    last.current = now;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/karte/suche?q=${encodeURIComponent(text)}`, { headers: { Accept: "application/json" } });
      if (res.status === 429) {
        setResults(null);
        setMsg("Gerade sind zu viele Suchen unterwegs. Bitte in ein paar Sekunden noch einmal.");
        return;
      }
      if (!res.ok) {
        setResults(null);
        setMsg("Die Adresssuche ist gerade nicht erreichbar. Du kannst die Position auf der Karte setzen.");
        return;
      }
      const data = (await res.json()) as { results: Result[] };
      setResults(data.results);
      if (data.results.length === 0) setMsg("Nichts gefunden. Versuch es mit Straße, Hausnummer und Ort.");
    } catch {
      setMsg("Die Adresssuche ist gerade nicht erreichbar. Du kannst die Position auf der Karte setzen.");
    } finally {
      setBusy(false);
    }
  }

  function locate() {
    setMsg(null);
    if (!("geolocation" in navigator)) {
      setMsg("Dein Browser kann den Standort nicht bestimmen.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        apply(p.coords.latitude, p.coords.longitude);
        setMsg("Dein Standort ist eingetragen. Er wird erst mit dem Ort gespeichert.");
      },
      () => setMsg("Der Standort ist nicht verfügbar oder wurde nicht freigegeben."),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  return (
    <div className="mb-4 space-y-2 rounded-xl border border-stone-200 p-3" data-testid="address-search">
      <label htmlFor={`${idPrefix}-suche`} className="block text-sm font-medium">Adresse suchen</label>
      <div className="flex flex-wrap gap-2">
        <input
          id={`${idPrefix}-suche`}
          type="search"
          value={q}
          maxLength={120}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
          placeholder="Straße, Ort"
          className={`${inputCls} min-w-0 flex-1 basis-48`}
        />
        <button type="button" onClick={() => void search()} disabled={busy} className={ghostButtonCls}>
          {busy ? "Suche …" : "Suchen"}
        </button>
        <button type="button" onClick={locate} className={ghostButtonCls}>Mein Standort</button>
      </div>
      {msg ? <p role="status" className="text-sm text-stone-700">{msg}</p> : null}
      {results && results.length ? (
        <ul className="divide-y divide-stone-100" aria-label="Suchergebnisse">
          {results.map((r) => (
            <li key={`${r.lat},${r.lng},${r.label}`}>
              <button
                type="button"
                onClick={() => {
                  apply(r.lat, r.lng, r.label);
                  setResults(null);
                  setMsg(`Übernommen: ${r.label}`);
                }}
                className="block min-h-11 w-full py-2 text-left text-sm break-words hover:bg-stone-50"
                data-testid="address-result"
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-stone-600">
        Suche: Nominatim, Daten ©{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">OpenStreetMap-Mitwirkende</a>{" "}
        (ODbL). Der Suchtext geht über unseren Server an OpenStreetMap.
      </p>
    </div>
  );
}
