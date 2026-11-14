import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { RecipeDraft } from "../../lib/recipe-extract";
import { RECIPE_LIMITS as L } from "../../lib/recipes";
import { assertBelowLimit, rateLimit } from "../ratelimit";
import { recipeInput } from "../services/recipes";
import { withModule } from "../services/modules";

/**
 * Optional AI recipe ideas. Only the wish fields below ever leave the server: no names, no family
 * data, no stored recipes, no user ids. Active only when AI_PROVIDER and the provider's key are set.
 */
export const ideaRequest = z.object({
  wishes: z.string().trim().min(2).max(300),
  exclude: z.string().trim().max(200).default(""),
  diet: z.string().trim().max(60).default(""),
  maxMinutes: z.number().int().min(5).max(600).nullish().transform((v) => v ?? null),
  servings: z.number().int().min(1).max(20).nullish().transform((v) => v ?? null),
});
export type IdeaRequest = z.input<typeof ideaRequest>;
export type IdeaWishes = z.output<typeof ideaRequest>;

export interface RecipeIdeaProvider {
  readonly name: string;
  /** Returns the raw recipe object (validated by the caller). */
  suggest(wishes: IdeaWishes): Promise<unknown>;
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super("AI provider not configured");
    this.name = "AiNotConfiguredError";
  }
}
/** The provider failed or answered with something unusable; the cause is logged without content. */
export class AiProviderError extends Error {
  constructor(message = "AI provider failed") {
    super(message);
    this.name = "AiProviderError";
  }
}

/** A small model is enough for one recipe as JSON; AI_MODEL can pick another. */
export const DEFAULT_AI_MODEL = "claude-haiku-4-5";
/** A recipe as JSON stays well below this; it caps the cost of one call. */
export const MAX_OUTPUT_TOKENS = 1200;
export const IDEA_LIMIT = { max: 20, windowMs: 60 * 60_000 } as const;
/** Per family and day, on top of the hourly limit. */
export const IDEA_DAY_LIMIT = { max: 30, windowMs: 24 * 60 * 60_000 } as const;
/** All families together per day: a ceiling for the bill. In memory like the other limits (one instance). */
export const IDEA_GLOBAL_DAY_LIMIT = { max: 300, windowMs: 24 * 60 * 60_000 } as const;

const SYSTEM = [
  "Du bist ein Kochassistent für Familien. Gib genau ein Rezept über das Werkzeug rezept zurück.",
  "Sprache Deutsch, metrische Einheiten. Verwende keine ausgeschlossenen Zutaten. Nenne in allergens die",
  "enthaltenen Hauptallergene. Keine Links, keine Bilder.",
].join(" ");

/** Forced tool call: the API returns the recipe as a JSON object, no guessing in free text. */
const RECIPE_TOOL = {
  name: "rezept",
  description: "Ein Rezeptvorschlag.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      servings: { type: "integer" },
      prepMinutes: { type: "integer" },
      ingredients: {
        type: "array",
        items: {
          type: "object",
          properties: { quantity: { type: ["number", "null"] }, unit: { type: ["string", "null"] }, name: { type: "string" } },
          required: ["name"],
        },
      },
      steps: { type: "array", items: { type: "string" } },
      tags: { type: "array", items: { type: "string" } },
      allergens: { type: "string" },
    },
    required: ["title", "ingredients", "steps"],
  },
} as const;

export function ideaPrompt(w: IdeaWishes): string {
  const lines = [`Wünsche oder vorhandene Zutaten: ${w.wishes}`];
  if (w.exclude) lines.push(`Ausschließen (Allergene, Zutaten): ${w.exclude}`);
  if (w.diet) lines.push(`Ernährungsweise: ${w.diet}`);
  if (w.maxMinutes) lines.push(`Höchstens ${w.maxMinutes} Minuten`);
  if (w.servings) lines.push(`Portionen: ${w.servings}`);
  return lines.join("\n");
}

/** Anthropic Messages API over plain fetch (no SDK dependency). */
export class AnthropicProvider implements RecipeIdeaProvider {
  readonly name = "anthropic";
  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_AI_MODEL,
    private readonly fetchFn: typeof fetch = (...a) => fetch(...a),
  ) {}

  async suggest(w: IdeaWishes): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetchFn("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: this.model,
          max_tokens: MAX_OUTPUT_TOKENS,
          system: SYSTEM,
          tools: [RECIPE_TOOL],
          tool_choice: { type: "tool", name: RECIPE_TOOL.name },
          messages: [{ role: "user", content: ideaPrompt(w) }],
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new AiProviderError("AI request failed");
    }
    if (!res.ok) throw new AiProviderError(`AI provider status ${res.status}`);
    const body = (await res.json().catch(() => null)) as { content?: { type: string; text?: string; name?: string; input?: unknown }[] } | null;
    const tool = body?.content?.find((c) => c.type === "tool_use" && c.name === RECIPE_TOOL.name);
    if (tool && tool.input && typeof tool.input === "object") return tool.input;
    // Fallback: a plain text answer with a JSON object in it.
    const textOut = body?.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("") ?? "";
    return parseJsonObject(textOut);
  }
}

/** First {...} block of a model answer (tolerates code fences). */
export function parseJsonObject(s: string): unknown {
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a < 0 || b <= a) throw new AiProviderError("No JSON in answer");
  try {
    return JSON.parse(s.slice(a, b + 1));
  } catch {
    throw new AiProviderError("Invalid JSON in answer");
  }
}

let override: RecipeIdeaProvider | null | undefined;
/** Tests only: replace the provider (null = not configured, undefined = from env). */
export function setRecipeIdeaProvider(p: RecipeIdeaProvider | null | undefined): void {
  override = p;
}

export function recipeIdeaProvider(env: NodeJS.ProcessEnv = process.env): RecipeIdeaProvider | null {
  if (override !== undefined) return override;
  const kind = (env.AI_PROVIDER ?? "").trim().toLowerCase();
  if (kind === "anthropic" && env.ANTHROPIC_API_KEY) return new AnthropicProvider(env.ANTHROPIC_API_KEY, env.AI_MODEL?.trim() || DEFAULT_AI_MODEL);
  return null;
}

export const aiEnabled = () => recipeIdeaProvider() !== null;

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.slice(0, n) : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Model output -> validated draft. Links are dropped (a model can invent them). */
export type IdeaDraft = RecipeDraft & { allergens: string | null };

export function toDraft(raw: unknown): IdeaDraft {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const candidate = {
    title: clip(o.title, L.title) ?? "",
    description: clip(o.description, L.description),
    servings: num(o.servings) !== null ? Math.round(num(o.servings)!) : null,
    prepMinutes: num(o.prepMinutes) !== null ? Math.round(num(o.prepMinutes)!) : null,
    ingredients: arr(o.ingredients).slice(0, L.ingredients).map((i) => {
      const x = (i && typeof i === "object" ? i : {}) as Record<string, unknown>;
      const q = num(x.quantity);
      return { quantity: q !== null && q > 0 ? q : null, unit: clip(x.unit, L.unit), name: clip(x.name, L.ingredientName) ?? "" };
    }).filter((i) => i.name.trim()),
    steps: arr(o.steps).slice(0, L.steps).map((s) => clip(s, L.step) ?? "").filter(Boolean),
    tags: arr(o.tags).slice(0, L.tags).map((t) => clip(t, L.tag) ?? "").filter(Boolean),
    allergens: clip(o.allergens, L.allergens),
    imageUrl: null,
    sourceUrl: null,
  };
  const p = recipeInput.safeParse(candidate);
  if (!p.success) throw new AiProviderError("Unusable recipe in answer");
  const d = p.data;
  return { title: d.title, description: d.description, servings: d.servings, prepMinutes: d.prepMinutes, ingredients: d.ingredients, steps: d.steps, tags: d.tags, imageUrl: null, sourceUrl: null, allergens: d.allergens };
}

const GLOBAL_KEY = "recipe-idea:global";

/**
 * Asks the configured provider for a recipe idea. Membership first, then input, then the limits per family
 * (hour and day) and for all families (day); failed provider calls count too. Nothing is stored: the result is a draft for the form.
 */
export async function suggestRecipe(userId: string, familyId: string, raw: IdeaRequest, client?: PrismaClient): Promise<IdeaDraft> {
  await withModule("meals", userId, familyId, async () => undefined, client);
  const provider = recipeIdeaProvider();
  if (!provider) throw new AiNotConfiguredError();
  const wishes = ideaRequest.parse(raw);
  const familyKey = `recipe-idea:family:${familyId}`;
  const dayKey = `recipe-idea:day:${familyId}`;
  // Check every limit before counting any, so a refused call does not use up the others.
  assertBelowLimit(familyKey, IDEA_LIMIT.max);
  assertBelowLimit(dayKey, IDEA_DAY_LIMIT.max);
  assertBelowLimit(GLOBAL_KEY, IDEA_GLOBAL_DAY_LIMIT.max);
  rateLimit(familyKey, IDEA_LIMIT.max, IDEA_LIMIT.windowMs);
  rateLimit(dayKey, IDEA_DAY_LIMIT.max, IDEA_DAY_LIMIT.windowMs);
  rateLimit(GLOBAL_KEY, IDEA_GLOBAL_DAY_LIMIT.max, IDEA_GLOBAL_DAY_LIMIT.windowMs);
  let out: unknown;
  try {
    out = await provider.suggest(wishes);
  } catch (e) {
    console.warn("recipe idea: provider failed", e instanceof Error ? e.name : "unknown");
    throw e instanceof AiProviderError ? e : new AiProviderError();
  }
  return toDraft(out);
}
