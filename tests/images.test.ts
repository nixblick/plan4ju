import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as null | { id: string }, family: null as null | string }));
vi.mock("@/server/session", () => ({
  getSessionUser: async () => session.user,
  activeFamilyId: async () => session.family,
}));

import { admin, app, cleanup, seed, type Fixture } from "./helpers";
import { cleanImage, ImageError, IMAGE_MAX_BYTES, sniffImage } from "../src/lib/image-clean";
import { readImage, removeImage, setImage } from "../src/server/services/images";
import { GET } from "../src/app/api/bild/[id]/route";

const MARK = "GPS-MUSTER";
const enc = (s: string) => new TextEncoder().encode(s);
const cat = (...p: Uint8Array[]) => {
  const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0));
  let i = 0;
  for (const x of p) (o.set(x, i), (i += x.length));
  return o;
};
const has = (b: Uint8Array, s: string) => Buffer.from(b).includes(Buffer.from(s));

function seg(marker: number, payload: Uint8Array) {
  const n = payload.length + 2;
  return cat(new Uint8Array([0xff, marker, n >> 8, n & 0xff]), payload);
}
// Structurally valid JPEG skeleton (not decodable pixels; the cleaner only walks the segments).
function jpeg(): Uint8Array {
  return cat(
    new Uint8Array([0xff, 0xd8]),
    seg(0xe0, enc("JFIF\0\x01\x01\0\0\x01\0\x01\0\0")),
    seg(0xe1, enc(`Exif\0\0${MARK}`)),
    seg(0xed, enc(`Photoshop 3.0\0${MARK}`)),
    seg(0xfe, enc(MARK)),
    seg(0xdb, new Uint8Array(65)),
    seg(0xc0, new Uint8Array([8, 0, 1, 0, 1, 1, 1, 0x11, 0])),
    seg(0xc4, new Uint8Array(17)),
    seg(0xda, new Uint8Array([1, 1, 0, 0, 0x3f, 0])),
    new Uint8Array([0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56]),
    new Uint8Array([0xff, 0xd9]),
    // MPF-like trailer: a second JPEG with its own EXIF
    new Uint8Array([0xff, 0xd8]),
    seg(0xe1, enc(`Exif\0\0${MARK}`)),
    new Uint8Array([0xff, 0xd9]),
  );
}

const crcT = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function chunk(type: string, data: Uint8Array) {
  const td = cat(enc(type), data);
  let c = 0xffffffff;
  for (const x of td) c = crcT[(c ^ x) & 0xff]! ^ (c >>> 8);
  const o = new Uint8Array(12 + data.length);
  const dv = new DataView(o.buffer);
  dv.setUint32(0, data.length);
  o.set(td, 4);
  dv.setUint32(8 + data.length, (c ^ 0xffffffff) >>> 0);
  return o;
}
// 1x1 grey PNG
function png(): Uint8Array {
  const ihdr = new Uint8Array([0, 0, 0, 1, 0, 0, 0, 1, 8, 0, 0, 0, 0]);
  const idat = new Uint8Array([0x78, 0x9c, 0x63, 0x68, 0x00, 0x00, 0x00, 0x82, 0x00, 0x81]);
  return cat(
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("tEXt", enc(`Comment\0${MARK}`)),
    chunk("eXIf", enc(MARK)),
    chunk("IDAT", idat),
    chunk("iTXt", enc(`XML\0\0\0\0\0${MARK}`)),
    chunk("IEND", new Uint8Array()),
    enc(MARK),
  );
}

function riffChunk(type: string, data: Uint8Array) {
  const o = new Uint8Array(8 + data.length + (data.length & 1));
  o.set(enc(type));
  new DataView(o.buffer).setUint32(4, data.length, true);
  o.set(data, 8);
  return o;
}
function webp(): Uint8Array {
  const vp8x = new Uint8Array(10);
  vp8x[0] = 0x0c;
  const body = cat(enc("WEBP"), riffChunk("VP8X", vp8x), riffChunk("VP8L", new Uint8Array([0x2f, 0, 0, 0, 0])), riffChunk("EXIF", enc(MARK)), riffChunk("XMP ", enc(`${MARK}x`)));
  const head = cat(enc("RIFF"), new Uint8Array(4));
  new DataView(head.buffer).setUint32(4, body.length, true);
  return cat(head, body, enc(MARK));
}

describe("cleanImage", () => {
  it("detects the type by magic bytes only", () => {
    expect(sniffImage(png())).toBe("image/png");
    expect(sniffImage(jpeg())).toBe("image/jpeg");
    expect(sniffImage(webp())).toBe("image/webp");
    expect(sniffImage(enc("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(sniffImage(enc("GIF89a"))).toBeNull();
  });

  it("removes EXIF, IPTC, comments and the MPF trailer from JPEG", () => {
    const { mime, data } = cleanImage(jpeg());
    expect(mime).toBe("image/jpeg");
    expect(has(data, MARK)).toBe(false);
    expect(has(data, "JFIF")).toBe(true);
    expect([...data.subarray(-2)]).toEqual([0xff, 0xd9]);
    expect([...data.subarray(0, 2)]).toEqual([0xff, 0xd8]);
  });

  it("removes text, eXIf and anything after IEND from PNG", () => {
    const { data } = cleanImage(png());
    expect(has(data, MARK)).toBe(false);
    expect(has(data, "IDAT")).toBe(true);
    expect(has(data, "IEND")).toBe(true);
  });

  it("removes EXIF/XMP from WebP and clears their flags", () => {
    const { data } = cleanImage(webp());
    expect(has(data, MARK)).toBe(false);
    const dv = new DataView(data.buffer, data.byteOffset);
    expect(dv.getUint32(4, true)).toBe(data.length - 8);
    expect(data[20]! & 0x0c).toBe(0);
  });

  it("refuses wrong type, broken files and more than 5 MB", () => {
    const code = (b: Uint8Array) => {
      try {
        cleanImage(b);
        return "ok";
      } catch (e) {
        return e instanceof ImageError ? e.code : "other";
      }
    };
    expect(code(enc("hello"))).toBe("typ");
    expect(code(new Uint8Array())).toBe("typ");
    expect(code(png().subarray(0, 40))).toBe("kaputt");
    const badCrc = png();
    badCrc[30] = badCrc[30]! ^ 0xff;
    expect(code(badCrc)).toBe("kaputt");
    expect(code(jpeg().subarray(0, 30))).toBe("kaputt");
    expect(code(new Uint8Array(IMAGE_MAX_BYTES + 1).fill(0xff))).toBe("gross");
  });
});

let f: Fixture;
let wishA: string;
beforeAll(async () => {
  f = await seed();
  await admin.family.updateMany({ where: { id: { in: [f.familyA, f.familyB] } }, data: { moduleMeals: true, moduleWishes: true } });
  const list = await admin.wishlist.create({ data: { familyId: f.familyA, title: "Liste Muster", createdById: f.userA } });
  wishA = (await admin.wish.create({ data: { familyId: f.familyA, listId: list.id, title: "Ball", createdById: f.userA } })).id;
});
afterAll(async () => {
  await cleanup(f);
  await app.$disconnect();
  await admin.$disconnect();
});

const get = (id: string) => GET(new Request(`http://x/api/bild/${id}`), { params: Promise.resolve({ id }) });

describe("stored pictures", () => {
  it("only the own family gets the picture; everyone else 404", async () => {
    const { id } = await setImage(f.userB, f.familyB, { kind: "recipe", id: f.recipeB }, png(), app);
    const stored = await admin.image.findUniqueOrThrow({ where: { id } });
    expect(has(stored.data, MARK)).toBe(false);

    session.user = { id: f.userB };
    session.family = f.familyB;
    const ok = await get(id);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");
    expect(ok.headers.get("x-content-type-options")).toBe("nosniff");
    expect(ok.headers.get("cache-control")).toContain("no-store");
    expect(has(new Uint8Array(await ok.arrayBuffer()), "IHDR")).toBe(true);

    session.user = { id: f.userA };
    session.family = f.familyA;
    expect((await get(id)).status).toBe(404);
    session.user = { id: f.userBoth };
    session.family = f.familyA; // member of both, but family A active
    expect((await get(id)).status).toBe(404);
    session.user = null;
    session.family = null;
    expect((await get(id)).status).toBe(404);
    session.user = { id: f.userB };
    session.family = f.familyB;
    expect((await get("nicht-da")).status).toBe(404);
    expect((await get("../x")).status).toBe(404);

    expect(await readImage(f.userA, f.familyB, id, app)).toBeNull(); // not a member
    expect(await app.image.findMany()).toHaveLength(0); // no context: RLS shows nothing
  });

  it("a foreign family cannot attach a picture to a recipe or wish", async () => {
    await expect(setImage(f.userA, f.familyA, { kind: "recipe", id: f.recipeB }, png(), app)).rejects.toThrow();
    await expect(setImage(f.userB, f.familyB, { kind: "wish", id: wishA }, png(), app)).rejects.toThrow();
    await expect(setImage(f.userA, f.familyB, { kind: "recipe", id: f.recipeB }, png(), app)).rejects.toThrow();
  });

  it("replaces, removes, and goes away with its wish; module off hides it", async () => {
    const a = await setImage(f.userA, f.familyA, { kind: "wish", id: wishA }, png(), app);
    const b = await setImage(f.userA, f.familyA, { kind: "wish", id: wishA }, webp(), app);
    expect(await admin.image.count({ where: { wishId: wishA } })).toBe(1);
    expect(await admin.image.findUnique({ where: { id: a.id } })).toBeNull();
    await admin.family.update({ where: { id: f.familyA }, data: { moduleWishes: false } });
    expect(await readImage(f.userA, f.familyA, b.id, app)).toBeNull();
    await admin.family.update({ where: { id: f.familyA }, data: { moduleWishes: true } });
    expect((await readImage(f.userA, f.familyA, b.id, app))?.mime).toBe("image/webp");
    await removeImage(f.userA, f.familyA, { kind: "wish", id: wishA }, app);
    expect(await admin.image.count({ where: { wishId: wishA } })).toBe(0);
    await setImage(f.userA, f.familyA, { kind: "wish", id: wishA }, jpeg(), app);
    await admin.wish.delete({ where: { id: wishA } });
    expect(await admin.image.count({ where: { familyId: f.familyA } })).toBe(0);
  });
});
