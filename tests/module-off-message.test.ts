import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/session", () => ({ requireFamily: vi.fn() }));

import { calendarErrorCode } from "../src/app/action-helpers";
import { errorMessages } from "../src/lib/messages";
import { ModuleOffError, NotFoundError } from "../src/server/errors";

describe("switched-off module in a server action", () => {
  it("maps ModuleOffError to a clear German message", () => {
    const code = calendarErrorCode(new ModuleOffError());
    expect(code).toBe("modul-aus");
    expect(errorMessages[code]).toMatch(/^Dieses Modul ist ausgeschaltet/);
  });

  it("keeps plain NotFoundError as nicht-gefunden", () => {
    expect(calendarErrorCode(new NotFoundError())).toBe("nicht-gefunden");
  });

  it("ModuleOffError is still a NotFoundError, so pages keep answering 404", () => {
    expect(new ModuleOffError()).toBeInstanceOf(NotFoundError);
  });
});
