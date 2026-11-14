// Upload check for pictures (recipes, wishes) without a native dependency.
// The type comes from the magic bytes, never from the file name or the browser. Metadata is removed by
// rebuilding the container from a whitelist of segments/chunks: EXIF (incl. GPS), XMP, IPTC, comments, text
// chunks and anything appended after the image end are dropped. The pixel data itself is copied, not re-encoded
// (there is no pure-JS encoder for all three formats). Side effect: the EXIF orientation is gone, so a portrait
// phone photo can show up rotated. Anything that does not parse cleanly is refused.

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export type ImageMime = "image/png" | "image/jpeg" | "image/webp";

export class ImageError extends Error {
  constructor(public code: "typ" | "gross" | "kaputt") {
    super(`image ${code}`);
    this.name = "ImageError";
  }
}

export function sniffImage(b: Uint8Array): ImageMime | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "image/webp";
  return null;
}

function ascii(b: Uint8Array, at: number, n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += String.fromCharCode(b[at + i] ?? 0);
  return s;
}

const bad = () => new ImageError("kaputt");

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// JPEG: keep APP0 (JFIF), APP14 (Adobe colour transform) and the decoding segments; drop every other APPn
// (APP1 EXIF/XMP, APP2 ICC/MPF, APP13 IPTC, ...) and COM. Entropy data runs until the first FFD9 (stuffed
// 0xFF bytes are followed by 00, restart markers by D0-D7); everything after it (e.g. the second JPEG of an
// MPF file with its own EXIF) is cut off.
function cleanJpeg(b: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  let i = 2;
  for (;;) {
    if (i + 4 > b.length || b[i] !== 0xff) throw bad();
    let m = b[i + 1]!;
    while (m === 0xff && i + 2 < b.length) {
      i++;
      m = b[i + 1]!;
    }
    if (m === 0xd9) throw bad(); // image end before any scan
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) throw bad();
    const len = (b[i + 2]! << 8) | b[i + 3]!;
    if (len < 2 || i + 2 + len > b.length) throw bad();
    const seg = b.subarray(i, i + 2 + len);
    const keep = m === 0xe0 || m === 0xee || m === 0xdb || m === 0xc4 || m === 0xdd || m === 0xda || (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) || m === 0xcc;
    const isApp = m >= 0xe0 && m <= 0xef;
    if (!keep && !isApp && m !== 0xfe) throw bad();
    if (keep) parts.push(seg);
    i += 2 + len;
    if (m === 0xda) {
      // entropy-coded data (progressive files have several scans with tables in between)
      let j = i;
      for (;;) {
        if (j + 1 >= b.length) throw bad();
        if (b[j] === 0xff) {
          const n = b[j + 1]!;
          if (n === 0x00 || (n >= 0xd0 && n <= 0xd7) || n === 0xff) {
            j += n === 0xff ? 1 : 2;
            continue;
          }
          break;
        }
        j++;
      }
      parts.push(b.subarray(i, j));
      i = j;
      if (b[i + 1] === 0xd9) {
        parts.push(b.subarray(i, i + 2));
        return concat(parts);
      }
    }
  }
}

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// PNG: whitelist of chunks needed to show the picture (incl. APNG); text, eXIf, tIME and private chunks go,
// and nothing after IEND is kept. CRCs are checked.
const PNG_KEEP = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP", "sBIT", "pHYs", "bKGD", "acTL", "fcTL", "fdAT", "cICP"]);
function cleanPng(b: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let i = 8;
  let first = true;
  for (;;) {
    if (i + 12 > b.length) throw bad();
    const len = dv.getUint32(i);
    if (len > b.length || i + 12 + len > b.length) throw bad();
    const type = ascii(b, i + 4, 4);
    if (!/^[A-Za-z]{4}$/.test(type)) throw bad();
    if (first && type !== "IHDR") throw bad();
    first = false;
    if (crc32(b.subarray(i + 4, i + 8 + len)) !== dv.getUint32(i + 8 + len)) throw bad();
    if (PNG_KEEP.has(type)) parts.push(b.subarray(i, i + 12 + len));
    else if ((b[i + 4]! & 0x20) === 0) throw bad(); // unknown critical chunk
    i += 12 + len;
    if (type === "IEND") return concat(parts);
  }
}

// WebP: RIFF container; keep image chunks, drop EXIF/XMP (and unknown chunks), clear their flags in VP8X,
// rewrite the RIFF size and cut anything after the declared end.
const WEBP_KEEP = new Set(["VP8 ", "VP8L", "VP8X", "ALPH", "ANIM", "ANMF", "ICCP"]);
function cleanWebp(b: Uint8Array): Uint8Array {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const riff = dv.getUint32(4, true);
  if (riff < 4 || 8 + riff > b.length) throw bad();
  const end = 8 + riff;
  const parts: Uint8Array[] = [];
  let i = 12;
  let image = false;
  while (i < end) {
    if (i + 8 > end) throw bad();
    const type = ascii(b, i, 4);
    const len = dv.getUint32(i + 4, true);
    const total = 8 + len + (len & 1);
    if (i + 8 + len > end) throw bad();
    if (WEBP_KEEP.has(type)) {
      const chunk = b.slice(i, Math.min(i + total, end));
      if (type === "VP8X") {
        if (len < 10) throw bad();
        chunk[8] = chunk[8]! & ~0x0c; // EXIF (0x08) and XMP (0x04) flags
      }
      if (type === "VP8 " || type === "VP8L" || type === "ANMF") image = true;
      parts.push(chunk);
    }
    i += total;
  }
  if (!image) throw bad();
  const body = concat(parts);
  const out = new Uint8Array(12 + body.length);
  out.set(b.subarray(0, 12));
  new DataView(out.buffer).setUint32(4, 4 + body.length, true);
  out.set(body, 12);
  return out;
}

/** Checks type and size, returns the picture without metadata. Throws ImageError. */
export function cleanImage(input: Uint8Array): { mime: ImageMime; data: Uint8Array } {
  if (input.length === 0) throw new ImageError("typ");
  if (input.length > IMAGE_MAX_BYTES) throw new ImageError("gross");
  const mime = sniffImage(input);
  if (!mime) throw new ImageError("typ");
  try {
    const data = mime === "image/png" ? cleanPng(input) : mime === "image/jpeg" ? cleanJpeg(input) : cleanWebp(input);
    return { mime, data };
  } catch (e) {
    if (e instanceof ImageError) throw e;
    throw bad();
  }
}
