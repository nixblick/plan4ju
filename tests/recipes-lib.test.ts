import { describe, expect, it } from "vitest";
import { extractRecipe } from "../src/lib/recipe-extract";
import { formatQuantity, isoDurationMinutes, parseIngredientLine, parseServings, safeHttpsUrl, scaleQuantity } from "../src/lib/recipes";

describe("parseIngredientLine", () => {
  it.each([
    ["200 g Mehl", 200, "g", "Mehl"],
    ["1/2 TL Salz", 0.5, "TL", "Salz"],
    ["½ Bund Petersilie", 0.5, "Bund", "Petersilie"],
    ["1 ½ l Milch", 1.5, "l", "Milch"],
    ["1,5 kg Kartoffeln", 1.5, "kg", "Kartoffeln"],
    ["2-3 Äpfel", 3, null, "Äpfel"],
    ["2 - 3 EL Öl", 3, "EL", "Öl"],
    ["250g Butter", 250, "g", "Butter"],
    ["3 Eier", 3, null, "Eier"],
    ["Salz und Pfeffer", null, null, "Salz und Pfeffer"],
    ["1 Prise Zucker", 1, "Prise", "Zucker"],
    ["2 Pck. Vanillezucker", 2, "Pck.", "Vanillezucker"],
  ])("%s", (line, q, u, n) => {
    const r = parseIngredientLine(line);
    if (q === null) expect(r.quantity).toBeNull();
    else expect(r.quantity).toBeCloseTo(q);
    expect(r.unit).toBe(u);
    expect(r.name).toBe(n);
  });
  it("a lone unit word stays the name", () => {
    expect(parseIngredientLine("2 g")).toEqual({ quantity: 2, unit: null, name: "g" });
  });
});

describe("scaling and formatting", () => {
  it("scales by the servings factor", () => {
    expect(scaleQuantity(200, 4, 2)).toBe(100);
    expect(scaleQuantity(1, 4, 6)).toBe(1.5);
  });
  it("missing quantity or servings stay as they are", () => {
    expect(scaleQuantity(null, 4, 2)).toBeNull();
    expect(scaleQuantity(3, null, 2)).toBe(3);
    expect(scaleQuantity(3, 4, 0)).toBe(3);
  });
  it("formats in German with fractions", () => {
    expect(formatQuantity(0.5)).toBe("½");
    expect(formatQuantity(1.5)).toBe("1½");
    expect(formatQuantity(200)).toBe("200");
    expect(formatQuantity(1 / 3)).toBe("⅓");
    expect(formatQuantity(1.2345)).toBe("1,23");
    expect(formatQuantity(133.333)).toBe("133");
    expect(formatQuantity(null)).toBe("");
  });
  it("durations, servings and links", () => {
    expect(isoDurationMinutes("PT1H30M")).toBe(90);
    expect(isoDurationMinutes("P0DT45M")).toBe(45);
    expect(isoDurationMinutes("PT0M")).toBeNull();
    expect(isoDurationMinutes("90 Minuten")).toBeNull();
    expect(parseServings("4 Portionen")).toBe(4);
    expect(parseServings(["6", "6 servings"])).toBe(6);
    expect(parseServings(2)).toBe(2);
    expect(parseServings("viele")).toBeNull();
    expect(safeHttpsUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpsUrl("http://rezepte.example.test/a.jpg")).toBeNull();
    expect(safeHttpsUrl("https://u:p@rezepte.example.test/")).toBeNull();
    expect(safeHttpsUrl("https://rezepte.example.test/a.jpg")).toBe("https://rezepte.example.test/a.jpg");
  });
});

// Invented sample pages (no real site).
const JSONLD_GRAPH = `<!doctype html><html><head>
<script type="application/ld+json">{ not json </script>
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
  {"@type":"WebSite","name":"Musterküche"},
  {"@type":["Recipe","NewsArticle"],"name":"Ofengemüse &amp; Feta",
   "description":"<p>Bunt und <b>schnell</b>.</p>",
   "recipeYield":["4","4 Portionen"],"totalTime":"PT45M",
   "image":[{"@type":"ImageObject","url":"https://rezepte.example.test/ofen.jpg"}],
   "recipeIngredient":["500 g Kartoffeln","2 Paprika","200&nbsp;g Feta","Salz"],
   "recipeInstructions":[
     {"@type":"HowToSection","name":"Vorbereiten","itemListElement":[{"@type":"HowToStep","text":"Gemüse schneiden."}]},
     {"@type":"HowToStep","text":"Alles 30 Minuten backen."}],
   "recipeCategory":"Hauptgericht","keywords":"vegetarisch, Ofen, vegetarisch"}
]}
</script></head><body>Text</body></html>`;

const JSONLD_STRING_STEPS = `<script type='application/ld+json'>
[{"@type":"Recipe","name":"Pfannkuchen","recipeYield":2,"cookTime":"PT20M","image":"http://unsicher.example.test/a.jpg",
"recipeIngredient":["250 ml Milch","1/2 TL Salz"],"recipeInstructions":"Alles verrühren.\\nIn der Pfanne backen."}]
</script>`;

const MICRODATA = `<div itemscope itemtype="https://schema.org/Recipe">
<h1 itemprop="name">Linsensuppe</h1>
<meta itemprop="totalTime" content="PT1H">
<span itemprop="recipeYield">6 Portionen</span>
<img itemprop="image" src="https://rezepte.example.test/linsen.jpg" alt="">
<li itemprop="recipeIngredient">300 g Linsen</li>
<li itemprop="recipeIngredient">1 Zwiebel</li>
<div itemprop="recipeInstructions"><p>Zwiebel anschwitzen.</p><p>Linsen garen.</p></div>
</div>`;

describe("extractRecipe", () => {
  it("JSON-LD with @graph, type array, sections, image object, entities and tags", () => {
    const d = extractRecipe(JSONLD_GRAPH, "https://rezepte.example.test/ofen")!;
    expect(d.title).toBe("Ofengemüse & Feta");
    expect(d.description).toBe("Bunt und schnell .");
    expect(d.servings).toBe(4);
    expect(d.prepMinutes).toBe(45);
    expect(d.imageUrl).toBe("https://rezepte.example.test/ofen.jpg");
    expect(d.sourceUrl).toBe("https://rezepte.example.test/ofen");
    expect(d.ingredients).toEqual([
      { quantity: 500, unit: "g", name: "Kartoffeln" },
      { quantity: 2, unit: null, name: "Paprika" },
      { quantity: 200, unit: "g", name: "Feta" },
      { quantity: null, unit: null, name: "Salz" },
    ]);
    expect(d.steps).toEqual(["Gemüse schneiden.", "Alles 30 Minuten backen."]);
    expect(d.tags).toEqual(["Hauptgericht", "vegetarisch", "Ofen"]);
  });

  it("JSON-LD array with steps as one string; http image is dropped", () => {
    const d = extractRecipe(JSONLD_STRING_STEPS, null)!;
    expect(d.title).toBe("Pfannkuchen");
    expect(d.servings).toBe(2);
    expect(d.prepMinutes).toBe(20);
    expect(d.imageUrl).toBeNull();
    expect(d.steps).toEqual(["Alles verrühren.", "In der Pfanne backen."]);
    expect(d.ingredients[1]).toEqual({ quantity: 0.5, unit: "TL", name: "Salz" });
  });

  it("Microdata", () => {
    const d = extractRecipe(MICRODATA, "https://rezepte.example.test/linsen")!;
    expect(d.title).toBe("Linsensuppe");
    expect(d.servings).toBe(6);
    expect(d.prepMinutes).toBe(60);
    expect(d.imageUrl).toBe("https://rezepte.example.test/linsen.jpg");
    expect(d.ingredients.map((i) => i.name)).toEqual(["Linsen", "Zwiebel"]);
    expect(d.steps).toEqual(["Zwiebel anschwitzen.", "Linsen garen."]);
  });

  it("no recipe on the page", () => {
    expect(extractRecipe("<html><body>Kein Rezept</body></html>")).toBeNull();
    expect(extractRecipe('<script type="application/ld+json">{"@type":"Recipe"}</script>')).toBeNull();
  });

  it("caps long foreign data and stays fast on hostile input", () => {
    const many = Array.from({ length: 500 }, (_, i) => `"${i} g Zutat${i}"`).join(",");
    const d = extractRecipe(`<script type="application/ld+json">{"@type":"Recipe","name":"${"x".repeat(5000)}","recipeIngredient":[${many}]}</script>`)!;
    expect(d.title).toHaveLength(200);
    expect(d.ingredients).toHaveLength(100);
    const t = Date.now();
    extractRecipe("<script type=application/ld+json" + "<".repeat(200_000) + ' itemtype="https://schema.org/Recipe"' + "<a itemprop='x'".repeat(20_000));
    expect(Date.now() - t).toBeLessThan(2000);
  });
});
