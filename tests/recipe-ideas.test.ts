import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { admin, app, cleanup, seed, type Fixture } from "./helpers";
import {
  AiNotConfiguredError, AiProviderError, AnthropicProvider, DEFAULT_AI_MODEL, IDEA_DAY_LIMIT, IDEA_LIMIT, MAX_OUTPUT_TOKENS, ideaRequest, recipeIdeaProvider,
  setRecipeIdeaProvider, suggestRecipe, toDraft, type IdeaWishes, type RecipeIdeaProvider,
} from "../src/server/ai/recipe-ideas";
import { ForbiddenError, RateLimitError } from "../src/server/errors";
import { resetRateLimits } from "../src/server/ratelimit";

let f: Fixture;
beforeAll(async () => {
  f = await seed();
});
afterAll(async () => {
  await cleanup(f);
  await app.$disconnect();
  await admin.$disconnect();
});
beforeEach(() => resetRateLimits());
afterEach(() => {
  setRecipeIdeaProvider(undefined);
  vi.unstubAllEnvs();
});

const IDEA = {
  title: "Kartoffel-Spinat-Pfanne",
  description: "Schnell und einfach.",
  servings: 4,
  prepMinutes: 25,
  ingredients: [{ quantity: 800, unit: "g", name: "Kartoffeln" }, { quantity: 0, unit: null, name: "Salz" }, { name: 7 }],
  steps: ["Kartoffeln kochen.", "Mit Spinat braten."],
  tags: ["vegetarisch"],
  allergens: "keine Hauptallergene",
  imageUrl: "https://erfunden.example.test/bild.jpg",
  sourceUrl: "https://erfunden.example.test/",
};

function mock(out: unknown = IDEA) {
  const calls: IdeaWishes[] = [];
  const p: RecipeIdeaProvider = { name: "mock", suggest: async (w) => { calls.push(w); return out; } };
  setRecipeIdeaProvider(p);
  return calls;
}

describe("recipe ideas", () => {
  it("returns a validated draft without links; only the wish fields reach the provider", async () => {
    const calls = mock();
    const d = await suggestRecipe(f.userA, f.familyA, { wishes: "Kartoffeln, Spinat", exclude: "Nüsse", servings: 4 }, app);
    expect(d.title).toBe("Kartoffel-Spinat-Pfanne");
    expect(d.ingredients).toEqual([{ quantity: 800, unit: "g", name: "Kartoffeln" }, { quantity: null, unit: null, name: "Salz" }]);
    expect(d.imageUrl).toBeNull();
    expect(d.sourceUrl).toBeNull();
    expect(d.allergens).toBe("keine Hauptallergene");
    expect(calls).toEqual([{ wishes: "Kartoffeln, Spinat", exclude: "Nüsse", diet: "", maxMinutes: null, servings: 4 }]);
    expect(JSON.stringify(calls)).not.toMatch(/Muster|example\.test|u-a-/);
    expect(await admin.recipe.count({ where: { familyId: f.familyA } })).toBe(0); // nothing stored
  });

  it("is refused for non-members before the provider is called", async () => {
    const calls = mock();
    await expect(suggestRecipe(f.userNone, f.familyA, { wishes: "Nudeln" }, app)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(suggestRecipe(f.userA, f.familyB, { wishes: "Nudeln" }, app)).rejects.toBeInstanceOf(ForbiddenError);
    expect(calls).toHaveLength(0);
  });

  it("is off without configuration (no provider, provider without key)", async () => {
    setRecipeIdeaProvider(undefined);
    vi.stubEnv("AI_PROVIDER", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(recipeIdeaProvider()).toBeNull();
    await expect(suggestRecipe(f.userA, f.familyA, { wishes: "Nudeln" }, app)).rejects.toBeInstanceOf(AiNotConfiguredError);
    vi.stubEnv("AI_PROVIDER", "anthropic");
    expect(recipeIdeaProvider()).toBeNull();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-placeholder");
    vi.stubEnv("AI_PROVIDER", "unbekannt");
    expect(recipeIdeaProvider()).toBeNull();
    vi.stubEnv("AI_PROVIDER", "anthropic");
    expect(recipeIdeaProvider()?.name).toBe("anthropic");
  });

  it("rate limit is shared by the family and does not affect another family; failures count", async () => {
    let fail = true;
    setRecipeIdeaProvider({ name: "mock", suggest: async () => { if (fail) throw new Error("down"); return IDEA; } });
    await expect(suggestRecipe(f.userA, f.familyA, { wishes: "Nudeln" }, app)).rejects.toBeInstanceOf(AiProviderError);
    fail = false;
    for (let i = 1; i < IDEA_LIMIT.max; i++) await suggestRecipe(i % 2 ? f.userA : f.userBoth, f.familyA, { wishes: "Nudeln" }, app);
    await expect(suggestRecipe(f.userBoth, f.familyA, { wishes: "Nudeln" }, app)).rejects.toBeInstanceOf(RateLimitError);
    await expect(suggestRecipe(f.userB, f.familyB, { wishes: "Nudeln" }, app)).resolves.toBeTruthy();
  });

  it("a family also has a daily limit across hours", async () => {
    mock();
    const t0 = Date.now();
    try {
      vi.useFakeTimers({ toFake: ["Date"] });
      let made = 0;
      for (let h = 0; made < IDEA_DAY_LIMIT.max; h++) {
        vi.setSystemTime(t0 + h * (IDEA_LIMIT.windowMs + 1000));
        for (let i = 0; i < IDEA_LIMIT.max && made < IDEA_DAY_LIMIT.max; i++, made++) await suggestRecipe(f.userA, f.familyA, { wishes: "Nudeln" }, app);
      }
      vi.setSystemTime(t0 + 3 * (IDEA_LIMIT.windowMs + 1000));
      await expect(suggestRecipe(f.userA, f.familyA, { wishes: "Nudeln" }, app)).rejects.toBeInstanceOf(RateLimitError);
      await expect(suggestRecipe(f.userB, f.familyB, { wishes: "Nudeln" }, app)).resolves.toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("invalid wishes and unusable answers are refused", async () => {
    mock({ title: "" });
    await expect(suggestRecipe(f.userA, f.familyA, { wishes: "x" }, app)).rejects.toThrow();
    await expect(suggestRecipe(f.userA, f.familyA, { wishes: "Nudeln" }, app)).rejects.toBeInstanceOf(AiProviderError);
    expect(() => toDraft("Text")).toThrow(AiProviderError);
    expect(() => ideaRequest.parse({ wishes: "a".repeat(301) })).toThrow();
  });
});

describe("Anthropic adapter (fetch stubbed)", () => {
  const wishes = ideaRequest.parse({ wishes: "Reis, Gemüse", exclude: "Erdnüsse", diet: "vegan", maxMinutes: 30 });
  const answer = (text: string, status = 200) => new Response(JSON.stringify({ content: [{ type: "text", text }] }), { status });

  it("sends the wishes only, with key header and the default or configured model", async () => {
    const fetchFn = vi.fn(async () => answer("```json\n" + JSON.stringify(IDEA) + "\n```"));
    const out = await new AnthropicProvider("test-placeholder", undefined, fetchFn as unknown as typeof fetch).suggest(wishes);
    expect((out as { title: string }).title).toBe(IDEA.title);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const h = init.headers as Record<string, string>;
    expect(h["x-api-key"]).toBe("test-placeholder");
    expect(h["anthropic-version"]).toBe("2023-06-01");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe(DEFAULT_AI_MODEL);
    expect(DEFAULT_AI_MODEL).toMatch(/haiku/);
    expect(body.max_tokens).toBe(MAX_OUTPUT_TOKENS);
    expect(body.tool_choice).toEqual({ type: "tool", name: "rezept" });
    expect(body.tools[0].input_schema.required).toContain("title");
    expect(body.metadata).toBeUndefined();
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].content).toContain("Reis, Gemüse");
    expect(body.messages[0].content).toContain("Erdnüsse");

    vi.stubEnv("AI_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-placeholder");
    vi.stubEnv("AI_MODEL", "anderes-modell");
    const p = recipeIdeaProvider() as AnthropicProvider;
    expect((p as unknown as { model: string }).model).toBe("anderes-modell");
  });

  it("reads the recipe from the forced tool call", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "tool_use", name: "rezept", input: IDEA }] }), { status: 200 }));
    const out = await new AnthropicProvider("k", "m", fetchFn as unknown as typeof fetch).suggest(wishes);
    expect(toDraft(out).title).toBe(IDEA.title);
  });

  it("maps HTTP errors, network errors and non-JSON answers to AiProviderError", async () => {
    const mk = (fn: () => Promise<Response>) => new AnthropicProvider("k", "m", fn as unknown as typeof fetch);
    await expect(mk(async () => answer("", 500)).suggest(wishes)).rejects.toBeInstanceOf(AiProviderError);
    await expect(mk(async () => { throw new Error("ECONNRESET"); }).suggest(wishes)).rejects.toBeInstanceOf(AiProviderError);
    await expect(mk(async () => answer("Leider nein.")).suggest(wishes)).rejects.toBeInstanceOf(AiProviderError);
  });
});
