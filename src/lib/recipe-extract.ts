// Reads schema.org/Recipe from a fetched HTML page (JSON-LD first, then Microdata).
// Foreign input: size is capped first, only linear regular expressions, no HTML is rendered.
import { RECIPE_LIMITS, isoDurationMinutes, parseIngredientLine, parseServings, safeHttpsUrl, type IngredientLine } from "./recipes";

export interface RecipeDraft {
  title: string;
  description: string | null;
  servings: number | null;
  prepMinutes: number | null;
  ingredients: IngredientLine[];
  steps: string[];
  tags: string[];
  imageUrl: string | null;
  sourceUrl: string | null;
}

const MAX_HTML = 3 * 1024 * 1024;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß", deg: "°", frac12: "½", frac14: "¼", frac34: "¾", ndash: "–", mdash: "—" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8}\d{0,2});/gi, (all, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[e] ?? all;
  });
}

/** Plain text: tags removed, entities decoded, whitespace collapsed, length capped. */
export function cleanText(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  const noTags = raw.slice(0, max * 4).replace(/<[^<>]{0,2000}>/g, " ");
  return decodeEntities(decodeEntities(noTags).replace(/<[^<>]{0,2000}>/g, " ")).replace(/\s+/g, " ").trim().slice(0, max);
}

const isRecipeType = (t: unknown) => (Array.isArray(t) ? t.some(isRecipeType) : typeof t === "string" && /^(?:https?:\/\/schema\.org\/)?Recipe$/i.test(t));

function findRecipe(node: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 6 || node === null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node.slice(0, 200)) {
      const r = findRecipe(n, depth + 1);
      if (r) return r;
    }
    return null;
  }
  const o = node as Record<string, unknown>;
  if (isRecipeType(o["@type"])) return o;
  for (const key of ["@graph", "mainEntity", "mainEntityOfPage", "itemListElement"]) {
    const r = findRecipe(o[key], depth + 1);
    if (r) return r;
  }
  return null;
}

function instructionTexts(v: unknown, out: string[], depth = 0): void {
  if (depth > 4 || out.length >= RECIPE_LIMITS.steps) return;
  if (typeof v === "string") {
    // one string: split on line breaks, keep as one step if there are none
    for (const part of v.split(/\r?\n|<br\s?\/?>|<\/p>/i)) {
      const t = cleanText(part, RECIPE_LIMITS.step);
      if (t && out.length < RECIPE_LIMITS.steps) out.push(t);
    }
    return;
  }
  if (Array.isArray(v)) {
    for (const x of v) instructionTexts(x, out, depth + 1);
    return;
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.itemListElement !== undefined) instructionTexts(o.itemListElement, out, depth + 1);
    else instructionTexts(o.text ?? o.name, out, depth + 1);
  }
}

function imageOf(v: unknown, depth = 0): string | null {
  if (depth > 3) return null;
  if (typeof v === "string") return safeHttpsUrl(v);
  if (Array.isArray(v)) return v.length ? imageOf(v[0], depth + 1) : null;
  if (v && typeof v === "object") return imageOf((v as Record<string, unknown>).url ?? (v as Record<string, unknown>).contentUrl, depth + 1);
  return null;
}

function tagsOf(...vals: unknown[]): string[] {
  const out: string[] = [];
  for (const v of vals) {
    const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
    for (const x of list) {
      const t = cleanText(x, RECIPE_LIMITS.tag);
      if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase()) && out.length < RECIPE_LIMITS.tags) out.push(t);
    }
  }
  return out;
}

function draftFrom(o: Record<string, unknown>, sourceUrl: string | null): RecipeDraft | null {
  const title = cleanText(o.name ?? o.headline, RECIPE_LIMITS.title);
  if (!title) return null;
  const rawIngredients = o.recipeIngredient ?? o.ingredients;
  const ingredients = (Array.isArray(rawIngredients) ? rawIngredients : typeof rawIngredients === "string" ? [rawIngredients] : [])
    .slice(0, RECIPE_LIMITS.ingredients)
    .map((x) => cleanText(x, RECIPE_LIMITS.ingredientName))
    .filter(Boolean)
    .map(parseIngredientLine);
  const steps: string[] = [];
  instructionTexts(o.recipeInstructions, steps);
  return {
    title,
    description: cleanText(o.description, RECIPE_LIMITS.description) || null,
    servings: parseServings(o.recipeYield),
    prepMinutes: isoDurationMinutes(o.totalTime) ?? isoDurationMinutes(o.cookTime) ?? isoDurationMinutes(o.prepTime),
    ingredients,
    steps,
    tags: tagsOf(o.recipeCategory, o.recipeCuisine, o.keywords),
    imageUrl: imageOf(o.image),
    sourceUrl,
  };
}

function fromJsonLd(html: string, sourceUrl: string | null): RecipeDraft | null {
  const re = /<script[^>]{0,500}type\s*=\s*["']?application\/ld\+json["']?[^>]{0,500}>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(html)) && n++ < 50) {
    let data: unknown;
    try {
      data = JSON.parse(m[1]!.trim());
    } catch {
      continue;
    }
    const r = findRecipe(data);
    if (r) {
      const d = draftFrom(r, sourceUrl);
      if (d) return d;
    }
  }
  return null;
}

/** Microdata: the part of the page after itemtype=".../Recipe", values from itemprop elements. */
function fromMicrodata(html: string, sourceUrl: string | null): RecipeDraft | null {
  const start = html.search(/itemtype\s*=\s*["']https?:\/\/schema\.org\/Recipe["']/i);
  if (start < 0) return null;
  const part = html.slice(start, start + 500_000);
  const values: Record<string, string[]> = {};
  const add = (k: string, v: string) => (values[k] ??= []).push(v);
  // meta/link/img style: value in content= / href= / src=
  const attrRe = /<(?:meta|link|img)\b[^>]{0,1000}>/gi;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(part))) {
    const tag = m[0];
    const prop = /itemprop\s*=\s*["']([^"']{1,60})["']/i.exec(tag)?.[1];
    const val = /(?:content|href|src)\s*=\s*["']([^"']{0,2000})["']/i.exec(tag)?.[1];
    if (prop && val !== undefined) add(prop, decodeEntities(val));
  }
  // element style: <x itemprop="p">text</x>. Opening tag by regex, the closing tag by indexOf in a
  // bounded window (no backtracking over foreign HTML); at most 500 elements.
  const openRe = /<([a-z][a-z0-9]{0,10})\b([^<>]{0,1000})>/gi;
  let seen = 0;
  while ((m = openRe.exec(part)) && seen < 500) {
    const prop = /itemprop\s*=\s*["']([^"']{1,60})["']/i.exec(m[2]!)?.[1];
    if (!prop) continue;
    seen += 1;
    const from = openRe.lastIndex;
    const end = part.slice(from, from + 20_000).indexOf(`</${m[1]!.toLowerCase()}`);
    if (end >= 0) add(prop, part.slice(from, from + end));
  }
  const one = (k: string) => values[k]?.[0];
  return draftFrom(
    {
      name: one("name"),
      description: one("description"),
      recipeYield: one("recipeYield"),
      totalTime: one("totalTime"),
      cookTime: one("cookTime"),
      prepTime: one("prepTime"),
      recipeIngredient: values.recipeIngredient ?? values.ingredients,
      recipeInstructions: values.recipeInstructions,
      recipeCategory: values.recipeCategory,
      keywords: one("keywords"),
      image: one("image"),
    },
    sourceUrl,
  );
}

/** Extracts a recipe draft or returns null if the page has no schema.org/Recipe. */
export function extractRecipe(htmlRaw: string, sourceUrl: string | null = null): RecipeDraft | null {
  const html = htmlRaw.slice(0, MAX_HTML);
  const src = safeHttpsUrl(sourceUrl);
  return fromJsonLd(html, src) ?? fromMicrodata(html, src);
}
