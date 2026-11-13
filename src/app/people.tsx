import { initial, NEUTRAL, personColor } from "@/lib/colors";
import type { DashProfile } from "@/server/services/dashboard";

export function colorOf(profiles: DashProfile[], id: string | undefined) {
  const p = profiles.find((x) => x.id === id);
  return p ? personColor(p.colorIndex) : NEUTRAL;
}

export function Avatar({ name, colorIndex, size = 28 }: { name: string; colorIndex: number; size?: number }) {
  const c = personColor(colorIndex);
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: c.solid, fontSize: size * 0.45 }}
    >
      {initial(name)}
    </span>
  );
}

/** Coloured dots, one per assignee (grey when nobody is responsible). */
export function Dots({ profiles, ids }: { profiles: DashProfile[]; ids: string[] }) {
  const list = ids.length ? ids : [undefined];
  return (
    <span className="flex shrink-0 gap-0.5" aria-hidden="true">
      {list.map((id, i) => (
        <span key={id ?? i} className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: colorOf(profiles, id).solid }} />
      ))}
    </span>
  );
}

export function names(profiles: DashProfile[], ids: string[]): string {
  return ids.map((id) => profiles.find((p) => p.id === id)?.name).filter(Boolean).join(", ");
}
