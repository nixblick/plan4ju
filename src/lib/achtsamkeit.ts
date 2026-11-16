// Mindfulness module: topics, rating scale and emoji mapping (one place, used everywhere).

export const TOPICS = ["FOOD", "SLEEP", "MOOD", "WORK", "LEISURE", "HEALTH", "MOVEMENT", "FRESH_AIR", "SOCIAL"] as const;
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
  MOVEMENT: "Bewegung",
  FRESH_AIR: "Frische Luft",
  SOCIAL: "Soziale Kontakte",
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

/** Rating symbol, a setting per user (Release 0.9): emoji faces or colour coded circles. */
export const SYMBOLS = ["EMOJI", "CIRCLE"] as const;
export type RatingSymbol = (typeof SYMBOLS)[number];
export const isSymbol = (v: unknown): v is RatingSymbol => typeof v === "string" && (SYMBOLS as readonly string[]).includes(v);

/**
 * Pastel colour scale for the circles, bad to good: red, orange, yellow, green, blue. Each circle also has a
 * darker border (non-text contrast on white) and shows its number, so the scale never depends on colour alone.
 */
export const CIRCLE_COLORS: Record<number, { fill: string; border: string; name: string }> = {
  1: { fill: "#f8b4b4", border: "#b4474a", name: "rot" },
  2: { fill: "#fbcfa0", border: "#b0652a", name: "orange" },
  3: { fill: "#fbe7a1", border: "#9a7a12", name: "gelb" },
  4: { fill: "#bfe5b8", border: "#4a8a42", name: "grün" },
  5: { fill: "#b5d4f4", border: "#3f73ab", name: "blau" },
};

/** Text for screen readers and tooltips without emoji, e.g. "4 von 5 (gut)". */
export function ratingText(r: number): string {
  const x = RATINGS[r];
  return x ? `${r} von 5 (${x.word})` : String(r);
}

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
