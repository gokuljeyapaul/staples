// Real PDFs for tests: every page carries a marker "SRC=<name>;P=<n>"
// so the output's exact page order can be read back with pdf.js.
import { PDFDocument, StandardFonts } from "pdf-lib";
import pdfjs from "pdfjs-dist/legacy/build/pdf.js";

export const PAGE_SIZES = { A4: [595.28, 841.89], LETTER: [612, 792] };

export async function makePdf(name, pages, size = PAGE_SIZES.A4) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    doc.addPage(size).drawText(`SRC=${name};P=${i}`, { x: 40, y: size[1] - 60, size: 14, font });
  }
  return doc.save();
}

/** One entry per page: the marker found on it, or "" if none (e.g. flattened pages). */
export async function readMarkers(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true, verbosity: 0 }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    const text = tc.items.map(i => i.str).join("");
    out.push((text.match(/SRC=[^;]+;P=\d+/) || [""])[0]);
  }
  await doc.destroy();
  return out;
}

export async function pageSizes(bytes) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map(p => { const { width, height } = p.getSize(); return [+width.toFixed(2), +height.toFixed(2)]; });
}

/** Independent oracle: expected marker list for [name, pages, copies] entries. */
export const expectedMarkers = entries =>
  entries.flatMap(([name, pages, copies = 1]) =>
    Array.from({ length: copies }, () => Array.from({ length: pages }, (_, i) => `SRC=${name};P=${i + 1}`)).flat());

/** A plausible paperwork folder, with plausible page counts. */
export const DRIVE_SET = [
  ["Class_Notes_3_Copies.pdf", 2, 3],
  ["Group_Application.pdf", 3, 1],
  ["Housing_Contract.pdf", 1, 1],
  ["Ticket_3_Copies.pdf", 2, 3],
  ["Transcript.pdf", 1, 1],
  ["Vaccination_Record.pdf", 1, 1],
  ["Workshop_Certificate.pdf", 1, 1],
];
export const DRIVE_SET_PAGES = DRIVE_SET.reduce((s, [, p, c]) => s + p * c, 0); // 19
