import { describe, it, expect } from "vitest";
import { loadCore, file, html } from "../helpers/core.js";

const C = loadCore();

describe("copiesFromName: the _N_copies rule", () => {
  it.each([
    ["Class_Notes_3_Copies.pdf", 3],
    ["Ticket_3_Copies.pdf", 3],
    ["ticket_3_copies.pdf", 3],
    ["TICKET_3_COPIES.PDF", 3],
    ["Ticket_2_copies.pdf", 2],
    ["Ticket_10_copies.pdf", 10],
    ["Ticket_1_copy.pdf", 1],
    ["Ticket_2_copy.pdf", 2],
    ["Ticket_03_copies.pdf", 3],
    ["Ticket_3_Copies", 3],                       // no extension
    ["Ticket_3_Copies.jpg", 3],                   // images follow the same rule
    ["report_v2_3_copies.pdf", 3],                // other digits earlier in the name
    ["my.scan_3_copies.pdf", 3],                  // dots before the suffix
    ["Ticket_3_Copies (1).pdf", 3],        // browser/Drive clash rename
    ["Ticket_3_Copies(2).pdf", 3],
  ])("%s -> %i", (name, n) => expect(C.copiesFromName(name)).toBe(n));

  it.each([
    "Transcript.pdf",
    "Housing_Contract.pdf",
    "Vaccination_Record.pdf",
    "Ticket_3_copies_final.pdf",   // suffix must be at the end
    "3_copies.pdf",                // needs the leading underscore
    "Ticket_three_copies.pdf",
    "Ticket_3copies.pdf",
    "Ticket_3_cop.pdf",
    "Ticket_-3_copies.pdf",
    "Ticket_0_copies.pdf",         // zero copies means "still include once"
    "Ticket_3_copiess.pdf",
    "",
  ])("%s -> 1", name => expect(C.copiesFromName(name)).toBe(1));

  it("caps absurd counts at MAX_COPIES", () => {
    expect(C.MAX_COPIES).toBe(99);
    expect(C.copiesFromName("x_999_copies.pdf")).toBe(99);
    expect(C.copiesFromName("x_99_copies.pdf")).toBe(99);
  });
});

describe("effCopies and clampCopies", () => {
  it("uses the name-derived count unless overridden", () => {
    expect(C.effCopies({ autoCopies: 3, copies: null })).toBe(3);
    expect(C.effCopies({ autoCopies: 3, copies: undefined })).toBe(3);
    expect(C.effCopies({ autoCopies: 3, copies: 5 })).toBe(5);
    expect(C.effCopies({ autoCopies: 1, copies: 1 })).toBe(1);
    expect(C.effCopies({})).toBe(1);
  });
  it.each([[0, 1], [-4, 1], [1, 1], [7, 7], [99, 99], [100, 99], [2.9, 2], ["4", 4], ["abc", 1], [NaN, 1]])(
    "clampCopies(%s) -> %i", (input, out) => expect(C.clampCopies(input)).toBe(out));
});

describe("shortName", () => {
  it.each([
    ["Ticket_3_Copies.pdf", "Ticket"],
    ["Transcript.pdf", "Transcript"],
    ["Ticket_3_Copies (1).pdf", "Ticket"],
    ["Plain.pdf", "Plain"],
    ["no_ext", "no ext"],
  ])("%s -> %s", (n, s) => expect(C.shortName(n)).toBe(s));
});

describe("file acceptance", () => {
  it.each([
    ["a.pdf", true], ["A.PDF", true], ["scan.jpg", true], ["scan.JPEG", true], ["scan.png", true],
    ["Drive Folder/sub/a.pdf", true], ["Drive Folder\\a.pdf", true],
    ["notes.txt", false], ["a.pdf.zip", false], ["image.gif", false], ["a.pdfx", false],
    ["__MACOSX/a.pdf", false], ["folder/__MACOSX/._a.pdf", false], [".hidden.pdf", false],
    ["folder/.secret/a.pdf", false], ["._a.pdf", false],
  ])("isAcceptedName(%s) -> %s", (n, ok) => expect(C.isAcceptedName(n)).toBe(ok));

  it("detects images and zips", () => {
    expect(C.isImageName("a.JPG")).toBe(true);
    expect(C.isImageName("a.png")).toBe(true);
    expect(C.isImageName("a.pdf")).toBe(false);
    expect(C.isZipName("Trip_Docs-20260101T0400Z-001.zip")).toBe(true);
    expect(C.isZipName("a.pdf")).toBe(false);
  });

  it("treats same name + same size as a duplicate, and nothing else", () => {
    const files = [{ name: "a.pdf", size: 10 }];
    expect(C.isDuplicate(files, "a.pdf", 10)).toBe(true);
    expect(C.isDuplicate(files, "a.pdf", 11)).toBe(false);
    expect(C.isDuplicate(files, "b.pdf", 10)).toBe(false);
  });
});

describe("buildPlan", () => {
  it("is empty for no files", () => {
    expect(C.buildPlan([])).toEqual({ pages: [], blocks: [], kept: 0, removed: 0 });
  });

  it("lays out each file once, in order, with 1-based source pages", () => {
    const { pages, blocks } = C.buildPlan([file("a", "A.pdf", 2), file("b", "B.pdf", 1)]);
    expect(pages).toEqual([
      { id: "a", copy: 1, copies: 1, srcPage: 1, removed: false, out: 0 },
      { id: "a", copy: 1, copies: 1, srcPage: 2, removed: false, out: 1 },
      { id: "b", copy: 1, copies: 1, srcPage: 1, removed: false, out: 2 },
    ]);
    expect(blocks.map(b => [b.f.id, b.copy, b.start, b.end])).toEqual([["a", 1, 0, 1], ["b", 1, 2, 2]]);
  });

  it("repeats *_N_copies files N times as whole documents (1,2,1,2,1,2 not 1,1,1,2,2,2)", () => {
    const { pages, blocks } = C.buildPlan([file("t", "Ticket_3_Copies.pdf", 2)]);
    expect(pages.map(p => `${p.copy}.${p.srcPage}`)).toEqual(["1.1", "1.2", "2.1", "2.2", "3.1", "3.2"]);
    expect(blocks.map(b => [b.copy, b.copies, b.start, b.end])).toEqual([[1, 3, 0, 1], [2, 3, 2, 3], [3, 3, 4, 5]]);
  });

  it("honours a manual override over the file name", () => {
    expect(C.buildPlan([file("t", "Ticket_3_Copies.pdf", 2, { copies: 1 })]).pages).toHaveLength(2);
    expect(C.buildPlan([file("v", "Transcript.pdf", 1, { copies: 4 })]).pages).toHaveLength(4);
  });

  it("skips files with errors or no pages, without leaving gaps", () => {
    const { pages, blocks } = C.buildPlan([
      file("a", "A.pdf", 1),
      file("x", "Broken.pdf", 0, { error: "corrupt" }),
      file("y", "Locked.pdf", 3, { error: "needs password" }),
      file("z", "Empty.pdf", 0),
      file("b", "B.pdf", 1),
    ]);
    expect(pages.map(p => p.id)).toEqual(["a", "b"]);
    expect(blocks.map(b => [b.start, b.end])).toEqual([[0, 0], [1, 1]]);
  });

  it("blocks tile the page list exactly with no overlap", () => {
    const files = [file("a", "A_3_copies.pdf", 3), file("b", "B.pdf", 1), file("c", "C_2_copies.pdf", 4)];
    const { pages, blocks } = C.buildPlan(files);
    expect(pages).toHaveLength(3 * 3 + 1 + 4 * 2);
    let next = 0;
    for (const b of blocks) {
      expect(b.start).toBe(next);
      expect(b.end - b.start + 1).toBe(b.f.pages);
      for (let i = b.start; i <= b.end; i++) expect(pages[i]).toMatchObject({ id: b.f.id, copy: b.copy, srcPage: i - b.start + 1 });
      next = b.end + 1;
    }
    expect(next).toBe(pages.length);
  });

  it("does not mutate its input", () => {
    const files = [file("a", "A_2_copies.pdf", 1)];
    const snapshot = JSON.stringify(files);
    C.buildPlan(files);
    expect(JSON.stringify(files)).toBe(snapshot);
  });
});

describe("planSignature", () => {
  const a = file("a", "A.pdf", 1), b = file("b", "B_2_copies.pdf", 2);
  const sig = fs => C.planSignature(C.buildPlan(fs));
  it("is stable for the same pile", () => expect(sig([a, b])).toBe(sig([a, b])));
  it("changes when order changes", () => expect(sig([a, b])).not.toBe(sig([b, a])));
  it("changes when copies change", () => expect(sig([a, b])).not.toBe(sig([a, { ...b, copies: 3 }])));
  it("changes when a file is removed", () => expect(sig([a, b])).not.toBe(sig([a])));
  it("is empty for an empty pile", () => expect(sig([])).toBe(""));
});

describe("rangeLabel", () => {
  it("formats single pages and ranges 1-based", () => {
    expect(C.rangeLabel({ start: 0, end: 0 })).toBe("Page 1");
    expect(C.rangeLabel({ start: 3, end: 4 })).toBe("Pages 4–5");
  });
  it("uses output positions once pages are removed", () => {
    expect(C.rangeLabel({ start: 3, end: 6, outStart: 3, outEnd: 4 })).toBe("Pages 4–5");
    expect(C.rangeLabel({ start: 3, end: 6, outStart: 3, outEnd: 3 })).toBe("Page 4");
    expect(C.rangeLabel({ start: 3, end: 6, outStart: -1, outEnd: -1 })).toBe("Removed");
  });
});

describe("removing pages", () => {
  const T = (removed) => file("t", "Ticket_3_Copies.pdf", 2, { removed });

  it("pageKey and isRemoved address one page of one copy", () => {
    expect(C.pageKey(2, 1)).toBe("2.1");
    const f = T(["2.1"]);
    expect(C.isRemoved(f, 2, 1)).toBe(true);
    expect(C.isRemoved(f, 1, 1)).toBe(false);   // other copies untouched
    expect(C.isRemoved(f, 2, 2)).toBe(false);
    expect(C.isRemoved({}, 1, 1)).toBe(false);
  });

  it("withRemoved adds, deletes, de-duplicates and sorts numerically, without mutating", () => {
    const base = ["1.2"];
    expect(C.withRemoved(base, ["10.1", "2.1", "1.2"], true)).toEqual(["1.2", "2.1", "10.1"]);
    expect(C.withRemoved(["1.1", "1.2"], ["1.1", "9.9"], false)).toEqual(["1.2"]);
    expect(C.withRemoved(undefined, ["1.1"], true)).toEqual(["1.1"]);
    expect(C.withRemoved(null, [], false)).toEqual([]);
    expect(base).toEqual(["1.2"]);
  });

  it("keeps removed pages in the plan but numbers only the kept ones", () => {
    const { pages, kept, removed } = C.buildPlan([T(["1.2", "2.1"])]);
    expect(pages.map(p => [p.copy, p.srcPage, p.removed, p.out])).toEqual([
      [1, 1, false, 0], [1, 2, true, -1], [2, 1, true, -1], [2, 2, false, 1], [3, 1, false, 2], [3, 2, false, 3]]);
    expect([kept, removed]).toEqual([4, 2]);
  });

  it("gives each block its kept source pages and output range", () => {
    const { blocks } = C.buildPlan([T(["1.2", "2.1", "2.2"]), file("v", "Transcript.pdf", 1)]);
    expect(blocks.map(b => [b.copy, b.keep, b.kept, b.outStart, b.outEnd, C.rangeLabel(b)])).toEqual([
      [1, [0], 1, 0, 0, "Page 1"],
      [2, [], 0, -1, -1, "Removed"],
      [3, [0, 1], 2, 1, 2, "Pages 2–3"],
      [1, [0], 1, 3, 3, "Page 4"],
    ]);
  });

  it("removing everything leaves nothing to download", () => {
    const { pages, kept } = C.buildPlan([file("a", "A.pdf", 2, { removed: ["1.1", "1.2"] })]);
    expect(pages).toHaveLength(2);
    expect(kept).toBe(0);
  });

  it("removals for copies that no longer exist are ignored", () => {
    const f = T(["3.1", "3.2"]);
    f.copies = 2;
    expect(C.buildPlan([f]).kept).toBe(4);
    f.copies = null;  // back to 3: the removal comes back into force
    expect(C.buildPlan([f]).kept).toBe(4);
    expect(C.buildPlan([f]).pages).toHaveLength(6);
  });

  it("the plan signature changes when a page is removed or restored", () => {
    const sig = r => C.planSignature(C.buildPlan([T(r)]));
    expect(sig([])).not.toBe(sig(["1.1"]));
    expect(sig(["1.1"])).not.toBe(sig(["1.2"]));
    expect(sig(["1.1"])).toBe(sig(["1.1"]));
  });
});

describe("filenames", () => {
  const FB = "merged_2026-10-25.pdf";
  it.each([
    ["Trip docs pack", "Trip docs pack.pdf"],
    ["Notes.pdf", "Notes.pdf"],
    ["Notes.PDF", "Notes.PDF"],
    ["  spaced  ", "spaced.pdf"],
    ["a/b\\c:d*e?f\"g<h>i|j", "a_b_c_d_e_f_g_h_i_j.pdf"],
    ["", FB], [null, FB], [undefined, FB], ["   ", FB], ["...", FB], [".pdf", FB], ["///", "_.pdf"],
  ])("sanitizeFilename(%j)", (raw, out) => expect(C.sanitizeFilename(raw, FB)).toBe(out));

  it("defaultFilename uses the local date", () => {
    expect(C.defaultFilename(new Date(2026, 0, 5, 23, 59))).toBe("merged_2026-01-05.pdf");
    expect(C.defaultFilename(new Date(2026, 9, 25))).toBe("merged_2026-10-25.pdf");
  });
});

describe("ordering", () => {
  const arr = ["a", "b", "c", "d"].map(id => ({ id }));
  const ids = a => a.map(x => x.id).join("");

  it("moveItem moves and never mutates", () => {
    expect(ids(C.moveItem(arr, 0, 3))).toBe("bcda");
    expect(ids(C.moveItem(arr, 3, 0))).toBe("dabc");
    expect(ids(C.moveItem(arr, 1, 2))).toBe("acbd");
    expect(ids(C.moveItem(arr, 0, -1))).toBe("abcd");
    expect(ids(C.moveItem(arr, 0, 4))).toBe("abcd");
    expect(ids(arr)).toBe("abcd");
  });

  it("moveRelative drops before/after a target (drag and drop)", () => {
    expect(ids(C.moveRelative(arr, "a", "c", false))).toBe("bacd");
    expect(ids(C.moveRelative(arr, "a", "c", true))).toBe("bcad");
    expect(ids(C.moveRelative(arr, "d", "a", false))).toBe("dabc");
    expect(ids(C.moveRelative(arr, "d", "a", true))).toBe("adbc");
    expect(ids(C.moveRelative(arr, "b", "b", true))).toBe("abcd");
    expect(ids(C.moveRelative(arr, "zz", "a", true))).toBe("abcd");
    expect(ids(C.moveRelative(arr, "a", "zz", true))).toBe("abcd");
    expect(ids(arr)).toBe("abcd");
  });

  it("sortByName matches a Drive-style folder listing", () => {
    const drive = [
      "Bank_Statements.pdf", "Class_Notes_3_Copies.pdf", "Course_Syllabus.pdf",
      "Dorm_Contract.pdf", "Group_Application.pdf", "Housing_Contract.pdf",
      "Insurance_Policy.pdf", "Lab_Report.pdf", "Library_Card.pdf",
      "Medical_Report.pdf", "Membership_Card.pdf", "Rental_Agreement.pdf",
      "Ticket_3_Copies.pdf", "Transcript.pdf", "Vaccination_Record.pdf",
      "Workshop_Certificate.pdf",
    ];
    const shuffled = [...drive].reverse().map((name, i) => ({ id: String(i), name }));
    expect(C.sortByName(shuffled).map(f => f.name)).toEqual(drive);
  });

  it("sortByName is numeric-aware and case-insensitive", () => {
    const names = ["Page_10.pdf", "page_2.pdf", "Page_1.pdf"].map(name => ({ name }));
    expect(C.sortByName(names).map(f => f.name)).toEqual(["Page_1.pdf", "page_2.pdf", "Page_10.pdf"]);
  });
});

describe("module surface", () => {
  it("is frozen so the app cannot accidentally overwrite core logic", () => {
    expect(Object.isFrozen(C)).toBe(true);
  });
});

describe("app wiring", () => {
  // The app script pulls functions out of StapleCore by destructuring. Forgetting one only
  // fails at click time in the browser, so check the wiring statically.
  const src = html();
  const app = src.split('<script id="staple-core">')[1].split("</script>")[1];
  const m = app.match(/const\s*\{([^}]+)\}\s*=\s*StapleCore;/);
  const imported = m[1].split(",").map(s => s.trim()).filter(Boolean);
  const body = app.replace(m[0], "");

  it("only imports names that StapleCore actually exports", () => {
    for (const name of imported) expect(Object.keys(C), name).toContain(name);
  });

  it("imports every StapleCore function the app calls", () => {
    for (const name of Object.keys(C)) {
      if (typeof C[name] !== "function") continue;
      const defined = new RegExp(`(function\\s+${name}\\b|const\\s+${name}\\s*=)`).test(body);
      const called = new RegExp(`(?<![\\w.])${name}\\s*\\(`).test(body);
      if (called && !defined) expect(imported, `${name} is called but not imported`).toContain(name);
    }
  });
});
