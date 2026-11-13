// One fixed colour per person. The colour follows the position of the profile in the
// family (creation order), so it does not change between pages or visits.
export interface PersonColor {
  bg: string; // light surface
  fg: string; // text on the light surface (contrast >= 4.5)
  solid: string; // avatar / dot
}

const PALETTE: PersonColor[] = [
  { bg: "#dbeafe", fg: "#1e3a8a", solid: "#4f86c6" },
  { bg: "#fde7c2", fg: "#7c4a03", solid: "#c9963a" },
  { bg: "#fbdadf", fg: "#8a1f3a", solid: "#c4697a" },
  { bg: "#d5ecd8", fg: "#1c5a2d", solid: "#5f9a6a" },
  { bg: "#e6dcf6", fg: "#4b2a85", solid: "#8366c2" },
  { bg: "#d2eeee", fg: "#115e59", solid: "#3f9d98" },
  { bg: "#fbe1cf", fg: "#8a3a10", solid: "#d0804a" },
  { bg: "#e7e5e4", fg: "#44403c", solid: "#8a847f" },
];

export function personColor(index: number): PersonColor {
  return PALETTE[((index % PALETTE.length) + PALETTE.length) % PALETTE.length]!;
}

export const NEUTRAL: PersonColor = { bg: "#f5f0ea", fg: "#57534e", solid: "#a8a29e" };

export function initial(name: string): string {
  return (name.trim()[0] ?? "?").toUpperCase();
}
