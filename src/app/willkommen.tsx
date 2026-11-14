import Image from "next/image";
import type { ReactNode } from "react";

// Public part of the sign-in page: what Plan4JU is. Copy describes only features that exist (see the modules).

export function Hero({ children }: { children?: ReactNode }) {
  return (
    <section className="grid items-center gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-10" aria-labelledby="hero-titel">
      <div className="flex flex-col gap-4">
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-terracotta">Familienplaner</p>
        <h1 id="hero-titel" className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Die ganze Familienwoche an einem Ort.
        </h1>
        <p className="text-lg leading-relaxed text-stone-700">
          Aufgaben, Routinen, Termine, Essen und Einkauf – für alle sichtbar, für jeden in seiner Farbe. Auf dem Handy wie eine App.
        </p>
        {children}
      </div>
      <Image
        src="/illustrationen/hero.svg"
        alt="Illustration: ein Haus, darin die Wochentage als Karten mit Aufgaben in Familienfarben, davor vier Personen"
        width={720}
        height={520}
        unoptimized
        priority
        className="h-auto w-full"
      />
    </section>
  );
}

const SPOTS = [
  { bild: "aufgaben", bg: "bg-[#F4EEFB]", titel: "Aufgaben", text: "Für einen, für mehrere oder offen für alle – nach Fälligkeit sortiert.", alt: "Aufgabenliste mit farbigen Prioritäten und Haken" },
  { bild: "routinen", bg: "bg-[#EAF6F3]", titel: "Routinen", text: "Ins Bett bringen, Kita, Müll – fest verteilt oder reihum, jeden Tag abhakbar.", alt: "Kreislauf-Pfeil um einen Mond" },
  { bild: "essen", bg: "bg-[#FDF7E1]", titel: "Essen & Einkauf", text: "Wochenplan, wer kocht, und die Zutaten eines Rezepts mit einem Tipp auf die Liste.", alt: "Kochtopf mit Dampf neben einer Einkaufsliste" },
  { bild: "freizeit", bg: "bg-[#EAF2FC]", titel: "Freizeit & Wünsche", text: "Ausflugsziele auf der Karte, Wunschzettel mit Überraschungsschutz.", alt: "Gefaltete Karte mit Ortsmarke und Geschenk" },
] as const;

export function Funktionen() {
  return (
    <section id="funktionen" aria-labelledby="funktionen-titel" className="scroll-mt-6">
      <h2 id="funktionen-titel" className="mb-6 font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight sm:text-3xl">
        Alles, was eine Familie die Woche über jongliert
      </h2>
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {SPOTS.map((s) => (
          <li key={s.bild} className="flex flex-col gap-3">
            <div className={`flex h-44 items-center justify-center rounded-3xl ${s.bg}`}>
              <Image src={`/illustrationen/spot-${s.bild}.svg`} alt={s.alt} width={200} height={160} unoptimized />
            </div>
            <h3 className="font-[family-name:var(--font-display)] text-xl font-bold">{s.titel}</h3>
            <p className="leading-relaxed text-stone-700">{s.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
