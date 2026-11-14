// Shopping list categories (Release 0.8). The automatic choice is a local word list: no AI, no external
// service. German compounds are head-final ("Rinderhack" is Hack, "Orangensaft" is Saft), so after an exact
// match the longest known word ending wins. A manual choice always wins and is remembered per family.

export const CATEGORIES = {
  FLEISCH: "Fleisch",
  WURST: "Wurst",
  FISCH: "Fisch",
  KAESE: "Käse",
  GEMUESE: "Gemüse",
  OBST: "Obst",
  GETRAENKE: "Getränke",
  GEWUERZ: "Gewürz",
  TIEFKUEHL: "Tiefkühl",
  SUESSIGKEITEN: "Süßigkeiten",
  KONSERVEN: "Konserven",
  SONSTIGES: "Sonstiges",
} as const;
export type Category = keyof typeof CATEGORIES;
export const CATEGORY_KEYS = Object.keys(CATEGORIES) as Category[];
export const isCategory = (v: unknown): v is Category => typeof v === "string" && (CATEGORY_KEYS as string[]).includes(v);
/** Sort position: the order of the list above (Sonstiges last). */
export const categoryRank = (c: Category): number => CATEGORY_KEYS.indexOf(c);

const WORDS: Record<Exclude<Category, "SONSTIGES">, string[]> = {
  FLEISCH: [
    "fleisch", "hack", "hackfleisch", "gehacktes", "rind", "rinder", "schwein", "kalb", "lamm", "huhn", "hähnchen", "hühnchen", "hendl", "pute",
    "puten", "truthahn", "ente", "gans", "steak", "schnitzel", "kotelett", "filet", "braten", "gulasch", "geschnetzeltes", "keule", "brust",
    "schenkel", "flügel", "wings", "rippchen", "spareribs", "bauch", "nacken", "lende", "roulade", "frikadelle", "bulette", "burger", "patty",
    "leber", "wild", "reh", "hirsch", "kaninchen", "minutensteak", "medaillon", "medaillons", "beinscheibe", "tafelspitz", "hähnchenbrust",
  ],
  WURST: [
    "wurst", "würstchen", "salami", "schinken", "speck", "bacon", "aufschnitt", "mortadella", "lyoner", "fleischwurst", "leberkäse", "leberkas",
    "wiener", "frankfurter", "bratwurst", "chorizo", "cabanossi", "kassler", "mett", "teewurst", "leberwurst", "blutwurst", "pastrami",
    "prosciutto", "serrano", "pancetta", "katenschinken", "wurstaufschnitt", "speckwürfel", "schinkenwürfel", "landjäger", "debreziner", "weißwurst", "currywurst", "pfefferbeißer",
  ],
  FISCH: [
    "fisch", "lachs", "thunfisch", "forelle", "kabeljau", "seelachs", "hering", "matjes", "makrele", "sardine", "sardinen", "sardellen", "garnele",
    "garnelen", "shrimps", "scampi", "krabben", "muschel", "muscheln", "tintenfisch", "calamari", "dorsch", "scholle", "zander", "barsch",
    "pangasius", "rotbarsch", "lachsfilet", "fischfilet", "räucherlachs", "bismarckhering", "rollmops", "surimi", "kaviar",
  ],
  KAESE: [
    "käse", "gouda", "emmentaler", "edamer", "camembert", "brie", "mozzarella", "parmesan", "feta", "schafskäse", "hirtenkäse", "frischkäse",
    "mascarpone", "ricotta", "gorgonzola", "bergkäse", "tilsiter", "butterkäse", "raclette", "halloumi", "grana", "pecorino", "cheddar",
    "harzer", "limburger", "appenzeller", "gruyère", "reibekäse", "streukäse", "hüttenkäse", "quark", "körniger",
  ],
  GEMUESE: [
    "gemüse", "tomate", "tomaten", "gurke", "gurken", "paprika", "zwiebel", "zwiebeln", "lauchzwiebel", "knoblauch", "kartoffel", "kartoffeln",
    "möhre", "möhren", "karotte", "karotten", "rübe", "rüben", "salat", "eisbergsalat", "rucola", "spinat", "brokkoli", "broccoli", "blumenkohl",
    "kohl", "rotkohl", "weißkohl", "wirsing", "kohlrabi", "rosenkohl", "grünkohl", "zucchini", "zucchino", "aubergine", "auberginen", "lauch",
    "porree", "sellerie", "fenchel", "pilz", "pilze", "champignon", "champignons", "pfifferlinge", "erbsen", "bohnen", "mais", "spargel",
    "radieschen", "rettich", "kürbis", "süßkartoffel", "ingwer", "avocado", "rote bete", "bete", "chicorée", "mangold", "pastinake",
    "pastinaken", "schalotte", "schalotten", "frühlingszwiebel", "frühlingszwiebeln", "kresse", "feldsalat", "kopfsalat", "eisberg", "lollo",
    "chinakohl", "pak choi", "okra", "artischocke", "sprossen", "edamame", "salatgurke", "kirschtomaten", "cocktailtomaten", "rispentomaten",
  ],
  OBST: [
    "obst", "apfel", "äpfel", "birne", "birnen", "banane", "bananen", "orange", "orangen", "apfelsine", "mandarine", "mandarinen", "clementine",
    "clementinen", "zitrone", "zitronen", "limette", "limetten", "grapefruit", "traube", "trauben", "weintrauben", "erdbeere", "erdbeeren",
    "himbeere", "himbeeren", "heidelbeere", "heidelbeeren", "blaubeere", "blaubeeren", "johannisbeere", "johannisbeeren", "brombeere",
    "brombeeren", "beere", "beeren", "kirsche", "kirschen", "pflaume", "pflaumen", "zwetschge", "zwetschgen", "pfirsich", "pfirsiche",
    "nektarine", "nektarinen", "aprikose", "aprikosen", "mango", "mangos", "ananas", "kiwi", "kiwis", "melone", "melonen", "wassermelone",
    "papaya", "granatapfel", "feige", "feigen", "datteln", "rhabarber", "physalis", "litschi", "maracuja", "nuss", "nüsse", "walnüsse",
    "haselnüsse", "mandeln", "rosinen", "cranberries", "stachelbeeren", "quitte", "kaki", "pomelo",
  ],
  GETRAENKE: [
    "getränk", "getränke", "wasser", "mineralwasser", "sprudel", "saft", "schorle", "limo", "limonade", "cola", "fanta", "sprite", "eistee",
    "tee", "kaffee", "espresso", "bier", "pils", "radler", "weizen", "weißbier", "wein", "rotwein", "weißwein", "rosé", "sekt", "prosecco",
    "champagner", "sherry", "likör", "schnaps", "korn", "wodka", "whisky", "rum", "gin", "aperol", "nektar", "smoothie", "energydrink",
    "tonic", "malzbier", "kakao", "apfelschorle", "multivitaminsaft", "orangensaft", "apfelsaft", "kaffeebohnen", "kaffeepads", "kapseln",
  ],
  GEWUERZ: [
    "gewürz", "gewürze", "salz", "pfeffer", "paprikapulver", "curry", "currypulver", "zimt", "muskat", "muskatnuss", "oregano", "basilikum",
    "thymian", "rosmarin", "petersilie", "schnittlauch", "dill", "koriander", "kreuzkümmel", "kümmel", "majoran", "lorbeer", "lorbeerblätter",
    "nelken", "vanille", "vanillezucker", "kurkuma", "chili", "chiliflocken", "cayenne", "piment", "anis", "sternanis", "kardamom", "salbei",
    "minze", "estragon", "liebstöckel", "brühe", "gemüsebrühe", "fond", "bouillon", "würze", "kräuter", "senf", "meerrettich", "sojasauce",
    "sojasoße", "essig", "balsamico", "gewürzmischung", "knoblauchpulver", "zwiebelpulver", "safran", "ingwerpulver", "ras el hanout",
  ],
  TIEFKUEHL: [
    "tiefkühl", "tk", "eis", "speiseeis", "vanilleeis", "schokoeis", "erdbeereis", "wassereis", "stieleis", "softeis", "eiscreme", "eiswürfel", "pizza", "tiefkühlpizza", "pommes", "kroketten", "rösti", "fischstäbchen",
    "tiefkühlgemüse", "rahmspinat", "tiefkühlbeeren", "blätterteig", "eisbecher", "magnum", "tiefkühlkost", "gefroren", "frost",
  ],
  SUESSIGKEITEN: [
    "süßigkeit", "süßigkeiten", "schokolade", "schoko", "praline", "pralinen", "bonbon", "bonbons", "gummibärchen", "gummibären", "fruchtgummi",
    "lakritz", "kaugummi", "keks", "kekse", "plätzchen", "waffel", "waffeln", "kuchen", "torte", "muffin", "muffins", "chips", "flips",
    "salzstangen", "brezeln", "erdnussflips", "popcorn", "riegel", "müsliriegel", "nutella", "nougat", "marzipan", "lebkuchen", "dominosteine",
    "spekulatius", "lolli", "lutscher", "zuckerwatte", "kekse", "cracker", "brownie", "brownies", "donut", "donuts", "eis am stiel",
    "schokoriegel", "kinderschokolade", "haribo", "mars", "snickers", "twix", "toffifee", "duplo", "hanuta", "knoppers", "pudding",
  ],
  KONSERVEN: [
    "konserve", "konserven", "dose", "dosen", "büchse", "eingelegt", "eingelegte", "gewürzgurken", "cornichons", "passata", "tomatenmark",
    "pizzatomaten", "dosentomaten", "kidneybohnen", "kichererbsen", "linsen", "sauerkraut", "rotkraut", "apfelmus", "kompott", "ravioli",
    "eintopf", "dosensuppe", "oliven", "kapern", "pesto", "antipasti", "baked beans", "dosenmais", "thunfischdose", "gläser", "glas",
  ],
};

// Exact names that are not what their ending suggests: Reis is not ice ("eis"), Schwein is not wine ("wein").
const EXCEPTIONS: Record<string, Category> = {
  reis: "SONSTIGES",
  milchreis: "SONSTIGES",
  basmatireis: "SONSTIGES",
  risottoreis: "SONSTIGES",
  preis: "SONSTIGES",
  schwein: "FLEISCH",
  wildschwein: "FLEISCH",
  spanferkel: "FLEISCH",
  käsekuchen: "SUESSIGKEITEN",
  käsesahnetorte: "SUESSIGKEITEN",
  leberkäse: "WURST",
  leberkas: "WURST",
  fleischkäse: "WURST",
  fleischwurst: "WURST",
  fleischsalat: "WURST",
  nudelsalat: "SONSTIGES",
  kartoffelsalat: "SONSTIGES",
  thunfischsalat: "KONSERVEN",
  kokosmilch: "KONSERVEN",
  eier: "SONSTIGES",
  ei: "SONSTIGES",
  geleebananen: "SUESSIGKEITEN",
  schokobananen: "SUESSIGKEITEN",
  weingummi: "SUESSIGKEITEN",
  weingummis: "SUESSIGKEITEN",
  eisbergsalat: "GEMUESE",
  eistee: "GETRAENKE",
  rotkohl: "GEMUESE",
};

// Words that decide the category wherever they appear ("Tomaten in der Dose", "TK-Erbsen").
const STRONG: [string, Category][] = [
  ["tiefkühl", "TIEFKUEHL"],
  ["tk", "TIEFKUEHL"],
  ["gefroren", "TIEFKUEHL"],
  ["tiefgekühlt", "TIEFKUEHL"],
  ["dose", "KONSERVEN"],
  ["dosen", "KONSERVEN"],
  ["konserve", "KONSERVEN"],
];

/** Lower case, umlauts and ß folded, so "Äpfel" meets "apfel" and "Weißwein" meets "weisswein". */
export function fold(s: string): string {
  return s
    .normalize("NFC")
    .toLocaleLowerCase("de")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss")
    .replace(/[éè]/g, "e");
}

const DICT = new Map<string, Category>();
for (const [cat, words] of Object.entries(WORDS) as [Category, string[]][]) for (const w of words) if (!DICT.has(fold(w))) DICT.set(fold(w), cat);
const EXACT = new Map<string, Category>([...DICT, ...Object.entries(EXCEPTIONS).map(([k, v]) => [fold(k), v] as [string, Category])]);
// Endings for compounds: at least four letters ("Kräutertee" is the one short exception), so "eis", "rum"
// or "gin" never decide a longer word.
const SUFFIXES = [...DICT.entries()].filter(([k]) => (k.length >= 4 || k === "tee") && !k.includes(" ")).sort((a, b) => b[0].length - a[0].length);
const STRONG_FOLDED = STRONG.map(([k, v]) => [fold(k), v] as const);

/** Singular candidates of a (folded) word: the word first, then without common plural endings. */
function forms(w: string): string[] {
  const out = [w];
  for (const end of ["en", "n", "e", "s", "er"]) if (w.length > end.length + 2 && w.endsWith(end)) out.push(w.slice(0, -end.length));
  return out;
}

function ofWord(w: string): Category | null {
  for (const f of forms(w)) {
    const hit = EXACT.get(f);
    if (hit) return hit;
  }
  for (const f of forms(w)) {
    for (const [k, cat] of SUFFIXES) if (f.length > k.length && f.endsWith(k)) return EXCEPTIONS_BY_END(f) ?? cat;
  }
  return null;
}

// A compound ending in an exception keeps the exception ("Basmatireis", "Hausschwein").
function EXCEPTIONS_BY_END(f: string): Category | null {
  for (const [k, v] of Object.entries(EXCEPTIONS)) {
    const fk = fold(k);
    if (fk.length >= 4 && f.endsWith(fk)) return v;
  }
  return null;
}

/**
 * Category from the item name alone. Strong words (TK, Tiefkühl, Dose) decide first, then the whole name
 * ("rote bete"), then the words from last to first (the head of a German noun phrase is usually last, but
 * "Tomaten passiert" has it first, so any known word counts). Unknown: Sonstiges.
 */
export function guessCategory(name: string): Category {
  const n = fold(name).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  if (!n) return "SONSTIGES";
  const words = n.split(" ").filter((w) => !/^\d/.test(w));
  for (const w of words) {
    for (const [k, v] of STRONG_FOLDED) if (w === k || (k.length > 2 && w.startsWith(k))) return v;
  }
  const whole = EXACT.get(n);
  if (whole) return whole;
  for (let i = words.length - 1; i >= 0; i--) {
    const hit = ofWord(words[i]!);
    if (hit) return hit;
  }
  return "SONSTIGES";
}

/** Manual choice, then the family's memory for this name, then the word list. */
export function resolveCategory(manual: string | null | undefined, remembered: string | null | undefined, name: string): Category {
  if (isCategory(manual)) return manual;
  if (isCategory(remembered)) return remembered;
  return guessCategory(name);
}
