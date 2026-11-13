// Templates offered when a family sets up routines (masterprompt section 9).
// They only prefill the form; the family edits and saves its own routine.

export interface RoutineTemplate {
  key: string;
  title: string;
  description: string;
  freq: "DAILY" | "WEEKLY" | "MONTHLY";
  weekdays: number[];
  timeOfDay: string;
}

export const ROUTINE_TEMPLATES: RoutineTemplate[] = [
  { key: "bett", title: "Ins Bett bringen", description: "", freq: "DAILY", weekdays: [], timeOfDay: "19:30" },
  { key: "abendessen", title: "Abendessen kochen", description: "", freq: "DAILY", weekdays: [], timeOfDay: "18:00" },
  { key: "kita-bringen", title: "Kita bringen", description: "", freq: "WEEKLY", weekdays: [0, 1, 2, 3, 4], timeOfDay: "08:00" },
  { key: "kita-holen", title: "Kita holen", description: "", freq: "WEEKLY", weekdays: [0, 1, 2, 3, 4], timeOfDay: "16:00" },
];

export const templateByKey = (key: string | undefined) => ROUTINE_TEMPLATES.find((t) => t.key === key);
