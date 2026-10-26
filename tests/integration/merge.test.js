import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import pdfjs from "pdfjs-dist/legacy/build/pdf.js";
import { loadCore, html, file } from "../helpers/core.js";
import { makePdf, readMarkers, pageSizes, expectedMarkers, DRIVE_SET, DRIVE_SET_PAGES, PAGE_SIZES } from "../helpers/pdf.js";

const C = loadCore();
const fixture = name => readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)));
const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8"));

/** Builds file records + a loader the way the app does. */
async function pile(entries) {
  const bytes = new Map(), files = [];
  for (const [i, [name, pages, , size]] of entries.entries()) {
    const id = "f" + i;
    bytes.set(id, await makePdf(name, pages, size));
    files.push(file(id, name, pages));
  }
  const getSrc = f => PDFDocument.load(bytes.get(f.id));
  return { files, getSrc };
}
const merge = async (files, getSrc, opts) => C.mergeBlocks(PDFDocument, C.buildPlan(files).blocks, getSrc, opts);

describe("merging the Drive folder", () => {
  let out;
  beforeAll(async () => {
    const { files, getSrc } = await pile(DRIVE_SET);
    out = await merge(files, getSrc);
  });

  it("produces exactly the expected number of pages", async () => {
    expect(DRIVE_SET_PAGES).toBe(19);
    expect((await PDFDocument.load(out)).getPageCount()).toBe(19);
  });

  it("puts every page in exactly the expected order", async () => {
    expect(await readMarkers(out)).toEqual(expectedMarkers(DRIVE_SET));
  });

  it("is a valid PDF for pdf.js too", async () => {
    const d = await pdfjs.getDocument({ data: new Uint8Array(out), verbosity: 0 }).promise;
    expect(d.numPages).toBe(19);
    await d.destroy();
  });
});

describe("merge behaviour", () => {
  it("applies manual copy overrides", async () => {
    const { files, getSrc } = await pile([["Ticket_3_Copies.pdf", 2], ["Transcript.pdf", 1]]);
    files[0].copies = 1; files[1].copies = 2;
    expect(await readMarkers(await merge(files, getSrc))).toEqual(
      expectedMarkers([["Ticket_3_Copies.pdf", 2, 1], ["Transcript.pdf", 1, 2]]));
  });

  it("follows the pile order after a reorder", async () => {
    const { files, getSrc } = await pile([["A.pdf", 1], ["B.pdf", 2], ["C.pdf", 1]]);
    const reordered = C.moveRelative(files, files[2].id, files[0].id, false);
    expect(await readMarkers(await merge(reordered, getSrc))).toEqual(expectedMarkers([["C.pdf", 1], ["A.pdf", 1], ["B.pdf", 2]]));
  });

  it("keeps each source page's own size (A4 and Letter mixed)", async () => {
    const { files, getSrc } = await pile([["A4_2_copies.pdf", 1, 2, PAGE_SIZES.A4], ["Letter.pdf", 1, 1, PAGE_SIZES.LETTER]]);
    expect(await pageSizes(await merge(files, getSrc))).toEqual([[595.28, 841.89], [595.28, 841.89], [612, 792]]);
  });

  it("leaves skipped files out entirely", async () => {
    const { files, getSrc } = await pile([["A.pdf", 1], ["B.pdf", 1]]);
    files[0].error = "corrupt";
    expect(await readMarkers(await merge(files, getSrc))).toEqual(["SRC=B.pdf;P=1"]);
  });

  it("sets title and producer metadata", async () => {
    const { files, getSrc } = await pile([["A.pdf", 1]]);
    const doc = await PDFDocument.load(await merge(files, getSrc, { title: "Trip docs pack" }), { updateMetadata: false });
    expect(doc.getTitle()).toBe("Trip docs pack");
    expect(doc.getProducer()).toBe("Staple");
  });

  it("returns null when cancelled mid-way (a newer build superseded it)", async () => {
    const { files, getSrc } = await pile([["A.pdf", 1], ["B.pdf", 1]]);
    let calls = 0;
    expect(await merge(files, getSrc, { isCancelled: () => ++calls >= 1 })).toBeNull();
  });

  it("loads each source once per block, never mutating the source", async () => {
    const src = await makePdf("S.pdf", 2);
    const before = Buffer.from(src).toString("base64");
    const files = [file("s", "S_3_copies.pdf", 2)];
    const loaded = await PDFDocument.load(src);
    const out = await merge(files, async () => loaded);
    expect((await PDFDocument.load(out)).getPageCount()).toBe(6);
    expect(loaded.getPageCount()).toBe(2);
    expect(Buffer.from(src).toString("base64")).toBe(before);
  });

  it("handles a large pile", async () => {
    const entries = Array.from({ length: 40 }, (_, i) => [`Doc_${i}${i % 5 === 0 ? "_2_copies" : ""}.pdf`, (i % 3) + 1, i % 5 === 0 ? 2 : 1]);
    const { files, getSrc } = await pile(entries);
    expect(await readMarkers(await merge(files, getSrc))).toEqual(expectedMarkers(entries));
  }, 30_000);
});

describe("removed pages", () => {
  it("drops exactly the removed pages, per copy", async () => {
    const { files, getSrc } = await pile([["Ticket_3_Copies.pdf", 2], ["Transcript.pdf", 1]]);
    files[0].removed = ["1.2", "3.1"];
    expect(await readMarkers(await merge(files, getSrc))).toEqual([
      "SRC=Ticket_3_Copies.pdf;P=1",
      "SRC=Ticket_3_Copies.pdf;P=1", "SRC=Ticket_3_Copies.pdf;P=2",
      "SRC=Ticket_3_Copies.pdf;P=2",
      "SRC=Transcript.pdf;P=1",
    ]);
  });

  it("skips a block whose pages are all removed without loading its file", async () => {
    const { files, getSrc } = await pile([["A.pdf", 2], ["B.pdf", 1]]);
    files[0].removed = ["1.1", "1.2"];
    const loaded = [];
    const out = await merge(files, f => { loaded.push(f.name); return getSrc(f); });
    expect(await readMarkers(out)).toEqual(["SRC=B.pdf;P=1"]);
    expect(loaded).toEqual(["B.pdf"]);
  });

  it("can remove a middle page of a long document", async () => {
    const { files, getSrc } = await pile([["Bank.pdf", 5]]);
    files[0].removed = ["1.3"];
    expect(await readMarkers(await merge(files, getSrc))).toEqual([1, 2, 4, 5].map(p => `SRC=Bank.pdf;P=${p}`));
  });
});

describe("images become pages", () => {
  it.each([["Passport_Scan.png", true], ["Visa_Scan.jpg", false]])("%s -> one A4 page", async (name, isPng) => {
    const buf = await C.imageToPdf(PDFDocument, fixture(name), isPng);
    const doc = await PDFDocument.load(buf);
    expect(doc.getPageCount()).toBe(1);
    expect(await pageSizes(await doc.save())).toEqual([[595.28, 841.89]]);
  });

  it("rejects a non-image", async () => {
    await expect(C.imageToPdf(PDFDocument, Buffer.from("nope"), true)).rejects.toThrow();
  });
});

describe("assumptions the app relies on", () => {
  it("pdf-lib refuses locked PDFs with an error mentioning encryption (drives the 🔒 flatten path)", async () => {
    await expect(PDFDocument.load(fixture("Locked_Owner_Only.pdf"))).rejects.toThrow(/encrypt/i);
  });

  it("pdf.js opens an owner-locked PDF without a password", async () => {
    const d = await pdfjs.getDocument({ data: new Uint8Array(fixture("Locked_Owner_Only.pdf")), verbosity: 0 }).promise;
    expect(d.numPages).toBe(2);
    await d.destroy();
  });

  it("pdf.js reports PasswordException for a password-protected PDF (drives the 'skipped' path)", async () => {
    await expect(pdfjs.getDocument({ data: new Uint8Array(fixture("Password_Required.pdf")), verbosity: 0 }).promise)
      .rejects.toMatchObject({ name: "PasswordException" });
  });

  it("the CDN versions in staple.html match the tested package versions", () => {
    const h = html();
    expect(h).toContain(`/pdf-lib/${pkg.devDependencies["pdf-lib"]}/pdf-lib.min.js`);
    expect(h).toContain(`/pdf.js/${pkg.devDependencies["pdfjs-dist"]}/pdf.min.js`);
    expect(h).toContain(`/pdf.js/${pkg.devDependencies["pdfjs-dist"]}/pdf.worker.min.js`);
    expect(h).toContain(`/jszip/${pkg.devDependencies["jszip"]}/jszip.min.js`);
  });

  it("every external script is pinned to an exact version", () => {
    const srcs = [...html().matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    expect(srcs.length).toBe(4);
    for (const s of srcs) expect(s).toMatch(/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/[\w.-]+\/\d+\.\d+\.\d+\//);
  });
});
