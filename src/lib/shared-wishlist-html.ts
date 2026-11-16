import { formatPrice, httpsUrl, occasionLabels, wishPriorityLabels, type Occasion } from "./wishes";

// Public, read-only page of a shared wish list (Release 0.9, docs/wunschzettel.md). Rendered as a plain HTML
// response outside the app layout: no navigation, no analytics, no scripts. Every value is escaped.

export interface SharedListView {
  ownerName: string;
  wishes: { title: string; description: string | null; url: string | null; imageUrl?: string | null; priceCents: number | null; priority: number; occasion: Occasion }[];
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const CSS = `
:root{color-scheme:light}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#faf7f2;color:#292524;line-height:1.5}
main{max-width:40rem;margin:0 auto;padding:1.5rem 1rem 3rem}
h1{font-size:1.5rem;margin:0 0 .25rem;overflow-wrap:anywhere}
.hint{color:#57534e;font-size:.875rem;margin:0 0 1.25rem}
ul{list-style:none;margin:0;padding:0}
li{background:#fff;border-radius:1rem;padding:1rem;margin:0 0 .75rem;box-shadow:0 0 0 1px #e7e5e4}
.t{font-weight:600;overflow-wrap:anywhere}
.m{color:#57534e;font-size:.875rem}
.d{margin:.25rem 0 0;font-size:.9rem;white-space:pre-line;overflow-wrap:anywhere}
a{color:#9a3f22;display:inline-flex;margin-right:1rem;min-height:44px;align-items:center}
footer{color:#78716c;font-size:.75rem;text-align:center;margin-top:2rem}
`;

export function renderSharedList(v: SharedListView): string {
  const name = v.ownerName || "jemanden";
  const items = v.wishes.map((w) => {
    const meta = [wishPriorityLabels[w.priority] ?? "", w.occasion !== "ANY" ? occasionLabels[w.occasion] : "", w.priceCents != null ? formatPrice(w.priceCents) : ""]
      .filter(Boolean)
      .map(esc)
      .join(" · ");
    const url = httpsUrl(w.url);
    const img = httpsUrl(w.imageUrl ?? null);
    return `<li data-testid="shared-wish"><div class="t">${esc(w.title)}</div>${meta ? `<div class="m">${meta}</div>` : ""}${
      w.description ? `<p class="d">${esc(w.description)}</p>` : ""
    }${url ? `<a href="${esc(url)}" rel="noopener noreferrer nofollow" target="_blank">Zum Angebot (${esc(new URL(url).hostname)})</a>` : ""}</li>`;
  });
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer">
<title>Wunschzettel von ${esc(name)}</title><style>${CSS}</style></head>
<body><main>
<h1>Wunschzettel von ${esc(name)}</h1>
<p class="hint">Nur zum Ansehen. Was schon jemand schenkt, ist hier nicht zu sehen – sprecht euch am besten ab.</p>
${items.length ? `<ul>${items.join("")}</ul>` : `<p>Gerade stehen keine Wünsche auf dem Zettel.</p>`}
<footer>Geteilt mit Plan4JU</footer>
</main></body></html>`;
}

export const NOT_FOUND_HTML = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Nicht gefunden</title></head>
<body style="font-family:system-ui,sans-serif;padding:2rem 1rem"><h1>Link nicht gefunden</h1>
<p>Dieser Link gilt nicht (mehr). Bitte frag nach einem neuen.</p></body></html>`;
