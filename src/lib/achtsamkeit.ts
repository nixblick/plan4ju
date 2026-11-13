// Mindfulness module: topics, rating scale and emoji mapping (one place, used everywhere).

export const TOPICS = ["FOOD", "SLEEP", "MOOD", "WORK", "LEISURE", "HEALTH"] as const;
export type Topic = (typeof TOPICS)[number];

export const VISIBILITIES = ["PRIVATE", "SELECTED", "FAMILY"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const TOPIC_LABELS: Record<Topic, string> = {
  FOOD: "Essen",
  SLEEP: "Schlaf",
  MOOD: "Stimmung",
  WORK: "Arbeit",
  LEISURE: "Freizeit",
  HEALTH: "Gesundheit",
};

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  PRIVATE: "Nur ich",
  SELECTED: "Ausgewählte Personen",
  FAMILY: "Ganze Familie",
};

/** 1 = schlecht … 5 = super. Emoji plus word, so the scale is clear without colour or emoji support. */
export const RATINGS: Record<number, { emoji: string; word: string }> = {
  1: { emoji: "😞", word: "schlecht" },
  2: { emoji: "🙁", word: "eher schlecht" },
  3: { emoji: "😐", word: "mittel" },
  4: { emoji: "🙂", word: "gut" },
  5: { emoji: "😄", word: "super" },
};

export const NOTE_MAX = 1000;

/** Health is treated restrictively: never visible to the whole family (also a DB check). */
export function allowedVisibilities(topic: Topic): Visibility[] {
  return topic === "HEALTH" ? ["PRIVATE", "SELECTED"] : [...VISIBILITIES];
}

export function ratingLabel(r: number): string {
  const x = RATINGS[r];
  return x ? `${x.emoji} ${r} von 5 (${x.word})` : String(r);
}

/** Average of ratings rounded to one decimal, null without values. */
export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}
