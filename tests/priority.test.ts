import { describe, expect, it } from "vitest";
import { compareByDue, LEGACY_PRIORITY, PRIORITIES, PRIORITY_BADGE, PRIORITY_LABEL, toPriority } from "../src/lib/priority";

describe("priorities", () => {
  it("has six levels in the agreed order with German names", () => {
    expect(PRIORITIES).toEqual(["SOFORT", "DRINGEND", "ZEITNAH", "DEMNAECHST", "BEI_GELEGENHEIT", "IRGENDWANN"]);
    expect(PRIORITIES.map((p) => PRIORITY_LABEL[p])).toEqual(["Sofort", "Dringend", "Zeitnah", "Demnächst", "Bei Gelegenheit", "Irgendwann"]);
  });
  it("maps the former three levels and falls back to Zeitnah", () => {
    expect(LEGACY_PRIORITY).toEqual({ HIGH: "DRINGEND", NORMAL: "ZEITNAH", LOW: "BEI_GELEGENHEIT" });
    expect(toPriority("HIGH")).toBe("DRINGEND");
    expect(toPriority("LOW")).toBe("BEI_GELEGENHEIT");
    expect(toPriority("IRGENDWANN")).toBe("IRGENDWANN");
    expect(toPriority("")).toBe("ZEITNAH");
    expect(toPriority("quatsch")).toBe("ZEITNAH");
  });
  it("uses pastel lila, rot, gelb, grün, blau, türkis with dark text", () => {
    const hues = PRIORITIES.map((p) => PRIORITY_BADGE[p].match(/bg-(\w+)-100/)![1]);
    expect(hues).toEqual(["violet", "red", "yellow", "green", "blue", "teal"]);
    for (const p of PRIORITIES) expect(PRIORITY_BADGE[p]).toMatch(/text-\w+-900/);
  });
});

describe("compareByDue", () => {
  const t = (title: string, dueDate: string | null, priority: (typeof PRIORITIES)[number] = "ZEITNAH", dueTime: string | null = null) => ({ title, dueDate, dueTime, priority });
  it("sorts by due date, time, priority, title; no date last", () => {
    const list = [
      t("ohne", null, "SOFORT"),
      t("spät", "2026-11-20"),
      t("früh irgendwann", "2026-11-14", "IRGENDWANN"),
      t("früh sofort", "2026-11-14", "SOFORT"),
      t("früh 08:00", "2026-11-14", "IRGENDWANN", "08:00"),
      t("ohne b", null, "IRGENDWANN"),
    ];
    expect(list.sort(compareByDue).map((x) => x.title)).toEqual(["früh 08:00", "früh sofort", "früh irgendwann", "spät", "ohne", "ohne b"]);
  });
  it("accepts Date objects", () => {
    expect(compareByDue(t("a", new Date("2026-11-14") as unknown as string), t("b", "2026-11-15"))).toBeLessThan(0);
  });
});
