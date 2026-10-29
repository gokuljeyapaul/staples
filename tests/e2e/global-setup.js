// Writes the PDF/zip fixtures the e2e suite uploads.
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { makePdf, DRIVE_SET } from "../helpers/pdf.js";

export const GEN = fileURLToPath(new URL("../.generated/", import.meta.url));
const FIX = fileURLToPath(new URL("../fixtures/", import.meta.url));

export default async function globalSetup() {
  await mkdir(GEN, { recursive: true });
  for (const [name, pages] of DRIVE_SET) await writeFile(GEN + name, await makePdf(name, pages));
  await writeFile(GEN + "Extra_Doc.pdf", await makePdf("Extra_Doc.pdf", 1));
  await writeFile(GEN + "Broken.pdf", "this is not a pdf at all");
  await writeFile(GEN + "Notes.docx", "rejection is by extension, so this can be fake");
  await writeFile(GEN + "Notes.txt", "Plain text notes.\nSecond line with enough words to wrap around the page once or twice.\n");
  await writeFile(GEN + "Syllabus.md", "# Course Outline\n\n## Week 1\n\n- Read chapter one\n- Do the **exercises**\n\nA short paragraph about grading.\n");
  await writeFile(GEN + "Grades.csv", "Name,Score\nAlice,90\nBob,85\n");
  for (const f of ["Locked_Owner_Only.pdf", "Password_Required.pdf", "Passport_Scan.png", "Visa_Scan.jpg",
    "Scan_Webp.webp", "Scan_Gif.gif", "Scan_Bmp.bmp", "Scan_Heic.heic"]) await copyFile(FIX + f, GEN + f);

  // What Google Drive hands you for "Download folder": nested folder + OS junk.
  const zip = new JSZip();
  zip.file("Trip Docs/Ticket_3_Copies.pdf", await makePdf("Ticket_3_Copies.pdf", 2));
  zip.file("Trip Docs/Transcript.pdf", await makePdf("Transcript.pdf", 1));
  zip.file("Trip Docs/scans/Passport_Scan.png", await (await import("node:fs/promises")).readFile(FIX + "Passport_Scan.png"));
  zip.file("Trip Docs/notes.txt", "ignore me");
  zip.file("Trip Docs/.DS_Store", "junk");
  zip.file("__MACOSX/Trip Docs/._Transcript.pdf", "junk");
  await writeFile(GEN + "Trip_Docs-20260101.zip", await zip.generateAsync({ type: "nodebuffer" }));
}
