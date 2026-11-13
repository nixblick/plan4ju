import { notFound } from "next/navigation";
import { cache } from "react";
import { MODULES, MODULE_KEYS, type ModuleKey } from "../lib/modules";
import { getModules, type ModuleState } from "./services/modules";
import { requireFamily } from "./session";

/** Module switches of the active family, read once per request (layout, navigation, tabs, page). */
export const activeModules = cache(async (): Promise<ModuleState> => {
  const { user, familyId } = await requireFamily();
  return getModules(user.id, familyId);
});

/** For pages of a switchable module: 404 while it is off. The services refuse anyway (withModule). */
export async function pageModule(key: ModuleKey): Promise<void> {
  if (!(await activeModules())[key]) notFound();
}

export const DEFAULT_MODULES = Object.fromEntries(MODULE_KEYS.map((k) => [k, MODULES[k].defaultOn])) as ModuleState;
