import { describe, expect, it } from "vitest";
import { CATEGORY_KEYS, guessCategory, resolveCategory, type Category } from "../src/lib/shopping-categories";

// Local word list (no AI, no external service): plural, compounds and the known traps.
const CASES: [string, Category][] = [
  // Fleisch, incl. compounds
  ["Rinderhack", "FLEISCH"], ["Hackfleisch gemischt", "FLEISCH"], ["Hähnchenbrust", "FLEISCH"], ["Hähnchenbrustfilet", "FLEISCH"],
  ["Putenschnitzel", "FLEISCH"], ["Schweinebauch", "FLEISCH"], ["Schwein", "FLEISCH"], ["Rindersteaks", "FLEISCH"], ["Lammkeule", "FLEISCH"],
  ["Hähnchenschenkel", "FLEISCH"], ["Kalbsschnitzel", "FLEISCH"], ["Gulasch", "FLEISCH"],
  // Wurst
  ["Würstchen", "WURST"], ["Bratwürste", "WURST"], ["Wiener Würstchen", "WURST"], ["Salami", "WURST"], ["Kochschinken", "WURST"],
  ["Leberwurst", "WURST"], ["Leberkäse", "WURST"], ["Speckwürfel", "WURST"], ["Bacon", "WURST"],
  // Fisch
  ["Lachs", "FISCH"], ["Räucherlachs", "FISCH"], ["Lachsfilet", "FISCH"], ["Garnelen", "FISCH"], ["Forellen", "FISCH"], ["Seelachsfilet", "FISCH"],
  // Käse
  ["Gouda", "KAESE"], ["Gouda gerieben", "KAESE"], ["Bergkäse", "KAESE"], ["Mozzarella", "KAESE"], ["Frischkäse", "KAESE"], ["Parmesan", "KAESE"],
  // Gemüse
  ["Tomaten", "GEMUESE"], ["Tomaten passiert", "GEMUESE"], ["Kartoffeln festkochend", "GEMUESE"], ["Zwiebeln rot", "GEMUESE"], ["2 Paprika", "GEMUESE"],
  ["Rote Bete", "GEMUESE"], ["Möhren", "GEMUESE"], ["Eisbergsalat", "GEMUESE"], ["Champignons", "GEMUESE"], ["Zucchini", "GEMUESE"], ["Brokkoli", "GEMUESE"],
  // Obst, incl. umlaut plurals
  ["Äpfel", "OBST"], ["Apfel", "OBST"], ["Bananen", "OBST"], ["Nüsse", "OBST"], ["Erdbeeren", "OBST"], ["Zitronen", "OBST"], ["Weintrauben", "OBST"],
  // Getränke
  ["Orangensaft", "GETRAENKE"], ["Apfelsaft", "GETRAENKE"], ["Traubensaft", "GETRAENKE"], ["Mineralwasser still", "GETRAENKE"], ["Weißwein", "GETRAENKE"],
  ["Rotwein", "GETRAENKE"], ["Bier", "GETRAENKE"], ["Kräutertee", "GETRAENKE"], ["Pfefferminztee", "GETRAENKE"], ["Kaffee", "GETRAENKE"], ["Cola", "GETRAENKE"],
  // Gewürz
  ["Salz", "GEWUERZ"], ["Pfeffer", "GEWUERZ"], ["Zimt", "GEWUERZ"], ["Oregano", "GEWUERZ"], ["Gemüsebrühe", "GEWUERZ"], ["Senf", "GEWUERZ"], ["Paprikapulver", "GEWUERZ"],
  // Tiefkühl
  ["TK-Erbsen", "TIEFKUEHL"], ["Tiefkühlpizza", "TIEFKUEHL"], ["Erbsen tiefgekühlt", "TIEFKUEHL"], ["Eis", "TIEFKUEHL"], ["Vanilleeis", "TIEFKUEHL"],
  ["Fischstäbchen", "TIEFKUEHL"], ["Pommes", "TIEFKUEHL"],
  // Süßigkeiten
  ["Gummibärchen", "SUESSIGKEITEN"], ["Schokolade", "SUESSIGKEITEN"], ["Vollmilchschokolade", "SUESSIGKEITEN"], ["Kekse", "SUESSIGKEITEN"],
  ["Käsekuchen", "SUESSIGKEITEN"], ["Chips", "SUESSIGKEITEN"],
  // Konserven
  ["Dose Tomaten", "KONSERVEN"], ["Dosentomaten", "KONSERVEN"], ["Kichererbsen", "KONSERVEN"], ["Tomatenmark", "KONSERVEN"], ["Sauerkraut", "KONSERVEN"],
  ["Gewürzgurken", "KONSERVEN"], ["Kokosmilch", "KONSERVEN"],
  // traps and unknown words
  ["Reis", "SONSTIGES"], ["Basmatireis", "SONSTIGES"], ["Milch", "SONSTIGES"], ["Brot", "SONSTIGES"], ["Nudeln", "SONSTIGES"], ["Eier", "SONSTIGES"],
  ["Klopapier", "SONSTIGES"], ["", "SONSTIGES"], ["   ", "SONSTIGES"], ["123", "SONSTIGES"],
];

describe("guessCategory", () => {
  it.each(CASES)("%s → %s", (name, cat) => {
    expect(guessCategory(name)).toBe(cat);
  });

  it("covers every category at least once", () => {
    const seen = new Set(CASES.map(([, c]) => c));
    for (const k of CATEGORY_KEYS) expect(seen.has(k), k).toBe(true);
  });

  it("ignores case and surrounding text", () => {
    expect(guessCategory("RINDERHACK")).toBe("FLEISCH");
    expect(guessCategory("  bio-tomaten  ")).toBe("GEMUESE");
  });
});

describe("resolveCategory", () => {
  it("manual choice wins over memory and word list, memory over word list", () => {
    expect(resolveCategory("OBST", "WURST", "Rinderhack")).toBe("OBST");
    expect(resolveCategory(null, "WURST", "Rinderhack")).toBe("WURST");
    expect(resolveCategory(null, null, "Rinderhack")).toBe("FLEISCH");
    expect(resolveCategory("KAPUTT", "AUCH", "Rinderhack")).toBe("FLEISCH");
  });
});
