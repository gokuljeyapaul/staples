import { test, expect, gen } from "./fixtures.js";
import { expectedMarkers, DRIVE_SET, DRIVE_SET_PAGES } from "../helpers/pdf.js";

const DRIVE_NAMES = DRIVE_SET.map(([n]) => n);
const uploadDrive = async app => { await app.upload(...DRIVE_NAMES); await expect(app.files()).toHaveCount(DRIVE_NAMES.length); };

test.describe("privacy guarantees", () => {
  test("nothing phones home: requests never leave this page, the pinned CDN and Google Fonts", async ({ page }) => {
    const hosts = new Set();
    page.on("request", r => hosts.add(new URL(r.url()).hostname));
    await page.goto("/staple.html");
    await page.waitForFunction(() => window.Staple && window.StapleCore);
    await page.setInputFiles("#fileInput", gen("Transcript.pdf"));
    await page.waitForFunction(() => window.Staple.idle());
    // The property that matters: no request ever reaches a host outside the allowlist.
    // (The font file host only appears when the stylesheet loads - REAL_CDN mode.)
    const allow = new Set(["127.0.0.1", "cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com"]);
    expect([...hosts].filter(h => !allow.has(h))).toEqual([]);
    expect(hosts.has("cdnjs.cloudflare.com")).toBe(true);
  });
});

test.describe("empty state", () => {
  test("invites a drop and disables download @mobile", async ({ app, page }) => {
    await expect(page.locator("#empty")).toBeVisible();
    await expect(page.locator("#empty h2")).toHaveText("Nothing to staple yet.");
    await expect(page.locator("#dlBtn")).toBeDisabled();
    await expect(page.locator("#ribbonWrap")).toBeHidden();
    await expect(page.locator("#qcount")).toHaveText("empty");
  });

  test("disappears once there are pages, and comes back after Clear files @mobile", async ({ app, page }) => {
    await app.upload("Transcript.pdf");
    await expect(app.files()).toHaveCount(1);
    await expect(page.locator("#empty")).toBeHidden();
    await app.action("Clear files");
    await app.confirm(true);
    await expect(page.locator("#empty")).toBeVisible();
    await expect(page.locator("#ribbonWrap")).toBeHidden();
  });
});

test.describe("hidden attribute guards", () => {
  test("nothing marked hidden is ever visible", async ({ app, page }) => {
    // Guards against CSS display rules overriding the hidden attribute.
    await app.upload("Transcript.pdf");
    await expect(app.files()).toHaveCount(1);
    const leaks = await page.evaluate(() => [...document.querySelectorAll("[hidden]")]
      .filter(n => getComputedStyle(n).display !== "none").map(n => n.id || n.className));
    expect(leaks).toEqual([]);
  });
});

test.describe("copy rule and merged output", () => {
  test("Drive folder merges into the exact expected pages and order @mobile", async ({ app, page }) => {
    await uploadDrive(app);
    expect(await app.idle()).toBe(DRIVE_SET_PAGES);
    await expect(page.locator("#statusText")).toContainText(`Ready · ${DRIVE_SET_PAGES} pages`);
    const { markers, name } = await app.download();
    expect(markers).toEqual(expectedMarkers(DRIVE_SET));
    expect(name).toMatch(/^merged_\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  test("files named _N_copies show the rule and a ×N stepper", async ({ app }) => {
    await uploadDrive(app);
    const flight = app.row("Ticket_3_Copies.pdf");
    await expect(flight.locator(".chip.auto")).toHaveText("×3 from name");
    await expect(app.stepper("Ticket_3_Copies.pdf").value).toHaveText("×3");
    await expect(app.row("Transcript.pdf").locator(".chip.auto")).toHaveCount(0);
    await expect(app.stepper("Transcript.pdf").value).toHaveText("×1");
  });

  test("stepper overrides change the download, and reset restores the rule", async ({ app, page }) => {
    await uploadDrive(app);
    await app.stepper("Transcript.pdf").plus.click();
    await app.stepper("Transcript.pdf").plus.click();
    await app.stepper("Ticket_3_Copies.pdf").minus.click();
    await expect(app.row("Transcript.pdf").locator(".chip", { hasText: "your call" })).toBeVisible();
    const expected = DRIVE_SET.map(([n, p, c]) => [n, p, n === "Transcript.pdf" ? 3 : n === "Ticket_3_Copies.pdf" ? 2 : c]);
    expect(await app.idle()).toBe(DRIVE_SET_PAGES + 2 - 2);
    expect((await app.download()).markers).toEqual(expectedMarkers(expected));

    await app.action("Reset copies");
    expect(await app.idle()).toBe(DRIVE_SET_PAGES);
    await expect(page.locator(".chip", { hasText: "your call" })).toHaveCount(0);
    expect((await app.download()).markers).toEqual(expectedMarkers(DRIVE_SET));
  });

  test("copies never drop below one", async ({ app }) => {
    await app.upload("Transcript.pdf");
    const s = app.stepper("Transcript.pdf");
    await s.minus.click(); await s.minus.click();
    await expect(s.value).toHaveText("×1");
    expect(await app.idle()).toBe(1);
  });
});

test.describe("ordering", () => {
  test("up/down buttons reorder the output", async ({ app }) => {
    await app.upload("Housing_Contract.pdf", "Transcript.pdf", "Workshop_Certificate.pdf");
    await expect(app.files()).toHaveCount(3);
    await app.row("Workshop_Certificate.pdf").getByLabel("Move Workshop_Certificate.pdf up").click();
    await app.row("Housing_Contract.pdf").getByLabel("Move Housing_Contract.pdf down").click();
    const order = ["Workshop_Certificate.pdf", "Housing_Contract.pdf", "Transcript.pdf"];
    expect(await app.fileOrder()).toEqual(order);
    await app.idle();
    expect((await app.download()).markers).toEqual(expectedMarkers(order.map(n => [n, 1])));
  });

  test("first row can't move up and last row can't move down", async ({ app }) => {
    await app.upload("Housing_Contract.pdf", "Transcript.pdf");
    await expect(app.files()).toHaveCount(2);
    await expect(app.row("Housing_Contract.pdf").getByLabel(/up$/)).toBeDisabled();
    await expect(app.row("Transcript.pdf").getByLabel(/down$/)).toBeDisabled();
  });

  test("drag and drop reorders the pile", async ({ app }) => {
    await app.upload("Housing_Contract.pdf", "Transcript.pdf", "Workshop_Certificate.pdf");
    await expect(app.files()).toHaveCount(3);
    await app.row("Workshop_Certificate.pdf").dragTo(app.row("Housing_Contract.pdf"), { targetPosition: { x: 40, y: 4 } });
    expect(await app.fileOrder()).toEqual(["Workshop_Certificate.pdf", "Housing_Contract.pdf", "Transcript.pdf"]);
    await app.idle();
    expect((await app.download()).markers).toEqual(expectedMarkers([["Workshop_Certificate.pdf", 1], ["Housing_Contract.pdf", 1], ["Transcript.pdf", 1]]));
  });

  test("Sort A–Z restores Drive order after a shuffled upload", async ({ app }) => {
    await app.upload(...[...DRIVE_NAMES].reverse());
    await expect(app.files()).toHaveCount(DRIVE_NAMES.length);
    expect(await app.fileOrder()).toEqual([...DRIVE_NAMES].reverse());
    await app.action("Sort A–Z");
    expect(await app.fileOrder()).toEqual(DRIVE_NAMES);
  });
});

test.describe("visual source markers", () => {
  test("page map has one segment per file copy, sized by page count", async ({ app, page }) => {
    await uploadDrive(app);
    const segs = page.locator("#ribbon .seg");
    const blocks = DRIVE_SET.reduce((s, [, , c]) => s + c, 0);
    await expect(segs).toHaveCount(blocks);
    const grows = await segs.evaluateAll(els => els.map(e => +getComputedStyle(e).getPropertyValue("--n")));
    expect(grows).toEqual(DRIVE_SET.flatMap(([, p, c]) => Array(c).fill(p)));
    await expect(page.locator("#ribbonTotal")).toHaveText(`${DRIVE_SET_PAGES} pages from ${DRIVE_SET.length} files`);
  });

  test("block headers state the page ranges and copy numbers", async ({ app, page }) => {
    await uploadDrive(app);
    const heads = page.locator(".block .block-head");
    await expect(heads.nth(0).locator(".range")).toHaveText("Pages 1–2");
    await expect(heads.nth(0).locator("h3")).toHaveText("Class_Notes_3_Copies.pdf");
    await expect(heads.nth(1).locator(".meta")).toContainText("copy 2 of 3");
    await expect(heads.nth(2).locator(".range")).toHaveText("Pages 5–6");
    await expect(heads.nth(3).locator(".range")).toHaveText("Pages 7–9");
    await expect(heads.nth(3).locator("h3")).toHaveText("Group_Application.pdf");
    await expect(heads.nth(4).locator(".range")).toHaveText("Page 10");
  });

  test("every thumbnail carries its output number and source tag", async ({ app, page }) => {
    await uploadDrive(app);
    const nums = await page.locator(".page .num").allTextContents();
    expect(nums).toEqual(Array.from({ length: DRIVE_SET_PAGES }, (_, i) => String(i + 1)));
    await expect(page.locator(".page").nth(3).locator(".tag")).toContainText("Class Notes");
    await expect(page.locator(".page").nth(3).locator(".tag")).toContainText("2/3");
    await expect(page.locator(".page").nth(6).getByText("p1")).toBeVisible();
  });

  test("thumbnails actually render", async ({ app, page }) => {
    await app.upload("Transcript.pdf");
    await expect(page.locator(".page .thumb img")).toHaveAttribute("src", /^blob:/);
    // Images decode asynchronously after src is set, so wait for it rather than checking once.
    await expect.poll(() => page.locator(".page .thumb img").evaluate(i => (i.complete ? i.naturalWidth : 0)))
      .toBeGreaterThan(50);
  });

  test("clicking a file highlights only its pages", async ({ app, page }) => {
    await uploadDrive(app);
    await app.row("Ticket_3_Copies.pdf").locator(".name").click();
    await expect(page.locator("#preview")).toHaveClass(/dim/);
    await expect(page.locator(".block.lit")).toHaveCount(3);
    await expect(page.locator(".seg.lit")).toHaveCount(3);
    await page.keyboard.press("Escape");
    await expect(page.locator(".block.lit")).toHaveCount(0);
  });

  test("clicking a page-map segment scrolls to that block", async ({ app, page }) => {
    await uploadDrive(app);
    await page.locator("#ribbon .seg").last().click();
    await expect(page.locator(".block").last()).toBeInViewport();
  });
});

test.describe("page inspector", () => {
  test("shows where a page came from, rendered from the merged PDF @mobile", async ({ app, page }) => {
    await uploadDrive(app);
    await app.idle();
    await page.locator(".page").nth(3).click();
    const insp = page.locator("#inspector");
    await expect(insp).toHaveClass(/on/);
    await expect(page.locator("#inspNum")).toContainText("4");
    await expect(page.locator("#inspNum small")).toHaveText(`of ${DRIVE_SET_PAGES}`);
    const facts = page.locator("#inspFacts");
    await expect(facts).toContainText("Class_Notes_3_Copies.pdf");
    await expect(facts).toContainText("2 of 2");     // source page
    await expect(facts).toContainText("2 of 3");     // copy
    await expect(facts).toContainText("pages 3–4 of the merged PDF");
    await expect.poll(() => page.locator("#canvasWrap canvas").evaluate(c => c.width)).toBeGreaterThan(200);
  });

  test("arrow keys and buttons flip pages; Escape closes", async ({ app, page }) => {
    await uploadDrive(app);
    await page.locator(".page").first().click();
    await expect(page.locator("#inspPrev")).toBeDisabled();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#inspNum")).toContainText("3");
    await page.click("#inspPrev");
    await expect(page.locator("#inspNum")).toContainText("2");
    await page.keyboard.press("Escape");
    await expect(page.locator("#inspector")).not.toHaveClass(/on/);
  });

  test("last page disables Next", async ({ app, page }) => {
    await app.upload("Transcript.pdf", "Housing_Contract.pdf");
    await expect(app.files()).toHaveCount(2);
    await page.locator(".page").last().click();
    await expect(page.locator("#inspNext")).toBeDisabled();
  });
});

test.describe("input formats", () => {
  test("Drive zip: nested folders kept, junk ignored", async ({ app }) => {
    await app.upload("Trip_Docs-20260101.zip");
    await expect(app.files()).toHaveCount(4);   // notes.txt is fair game now; only OS junk is ignored
    expect((await app.fileOrder()).sort()).toEqual(["Passport_Scan.png", "Ticket_3_Copies.pdf", "Transcript.pdf", "notes.txt"]);
    expect(await app.idle()).toBe(2 * 3 + 1 + 1 + 1);
  });

  test("PNG and JPG scans each become one page", async ({ app, page }) => {
    await app.upload("Passport_Scan.png", "Visa_Scan.jpg");
    await expect(app.files()).toHaveCount(2);
    expect(await app.idle()).toBe(2);
    const { bytes } = await app.download();
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  });

  test("WebP, GIF and BMP scans each become one page", async ({ app }) => {
    await app.upload("Scan_Webp.webp", "Scan_Gif.gif", "Scan_Bmp.bmp");
    await expect(app.files()).toHaveCount(3);
    expect(await app.idle()).toBe(3);
    const { markers } = await app.download();
    expect(markers).toEqual(["", "", ""]);   // image pages carry no text markers
  });

  test("TXT, MD and CSV each become one tidy text page", async ({ app }) => {
    await app.upload("Notes.txt", "Syllabus.md", "Grades.csv");
    await expect(app.files()).toHaveCount(3);
    expect(await app.idle()).toBe(3);
    const { markers } = await app.download();
    expect(markers).toEqual(["", "", ""]);
  });

  test("an iPhone HEIC scan becomes one page", async ({ app }) => {
    await app.upload("Scan_Heic.heic");
    await expect(app.files()).toHaveCount(1);
    expect(await app.idle()).toBe(1);
  });

  test("an XLSX spreadsheet becomes a titled text page", async ({ app }) => {
    await app.upload("Grades.xlsx");
    await expect(app.files()).toHaveCount(1);
    expect(await app.idle()).toBe(1);
    const { markers } = await app.download();
    expect(markers).toEqual([""]);
  });

  test("unsupported types are refused with a helpful nudge", async ({ app, page }) => {
    await app.upload("Transcript.pdf", "Notes.docx");
    await expect(app.files()).toHaveCount(1);
    await expect(page.locator(".toast", { hasText: ".docx can’t be read yet" })).toBeVisible();
    expect(await app.idle()).toBe(1);
  });

  test("duplicates are skipped", async ({ app, page }) => {
    await app.upload("Transcript.pdf");
    await expect(app.files()).toHaveCount(1);
    await app.upload("Transcript.pdf");
    await expect(page.locator(".toast", { hasText: "Skipped 1 duplicate" })).toBeVisible();
    await expect(app.files()).toHaveCount(1);
  });

  test("a corrupt file is flagged and left out", async ({ app }) => {
    await app.upload("Broken.pdf", "Transcript.pdf");
    await expect(app.files()).toHaveCount(2);
    await expect(app.row("Broken.pdf").locator(".chip.warn")).toHaveText("skipped");
    expect((await app.download()).markers).toEqual(["SRC=Transcript.pdf;P=1"]);
  });

  test("an owner-locked PDF is flattened and still merged", async ({ app }) => {
    await app.upload("Transcript.pdf", "Locked_Owner_Only.pdf");
    await expect(app.files()).toHaveCount(2);
    await expect(app.row("Locked_Owner_Only.pdf").getByText("🔒 flattened")).toBeVisible();
    expect(await app.idle()).toBe(3);
    const { markers } = await app.download();
    expect(markers).toEqual(["SRC=Transcript.pdf;P=1", "", ""]); // flattened pages are images
  });

  test("a password-protected PDF is skipped with a reason", async ({ app }) => {
    await app.upload("Password_Required.pdf", "Transcript.pdf");
    await expect(app.files()).toHaveCount(2);
    await expect(app.row("Password_Required.pdf")).toHaveAttribute("title", /password/i);
    expect(await app.idle()).toBe(1);
  });

  test("a pile of only unusable files can't be downloaded", async ({ app, page }) => {
    await app.upload("Broken.pdf");
    await expect(app.files()).toHaveCount(1);
    await expect(page.locator("#dlBtn")).toBeDisabled();
    await expect(page.locator("#statusText")).toHaveText("Nothing usable in the pile");
  });
});

test.describe("download", () => {
  test("uses and sanitises the Save as name", async ({ app, page }) => {
    await app.upload("Transcript.pdf");
    await page.fill("#fname", "Trip: docs/pack");
    expect((await app.download()).name).toBe("Trip_ docs_pack.pdf");
  });

  test("downloading right after a change never returns a stale PDF", async ({ app, page }) => {
    await app.upload("Transcript.pdf");
    await app.idle();
    await app.stepper("Transcript.pdf").plus.click();   // no waiting: debounce still pending
    expect((await app.download()).markers).toEqual(expectedMarkers([["Transcript.pdf", 1, 2]]));
  });
});

test.describe("removing pages", () => {
  const F = "Ticket_3_Copies.pdf", V = "Transcript.pdf";
  const flightAndVisa = async app => { await app.upload(F, V); await expect(app.files()).toHaveCount(2); expect(await app.idle()).toBe(7); };

  test("remove a single page; it stays visible, marked, and leaves the download @mobile", async ({ app, page }) => {
    await flightAndVisa(app);
    await app.binAt(3);                                   // copy 2, source page 2
    await expect(app.card(3)).toHaveClass(/removed/);
    await expect(app.card(3).locator(".stamp")).toHaveText("Removed");
    await expect(app.card(3).locator(".num")).toHaveText("✕");
    expect(await page.locator(".page .num").allTextContents()).toEqual(["1", "2", "3", "✕", "4", "5", "6"]);
    expect(await app.idle()).toBe(6);
    await expect(page.locator("#statusText")).toContainText("Ready · 6 pages");
    await expect(page.locator("#ribbonTotal")).toHaveText("6 pages from 2 files, 1 removed");
    expect((await app.download()).markers).toEqual([
      `SRC=${F};P=1`, `SRC=${F};P=2`, `SRC=${F};P=1`, `SRC=${F};P=1`, `SRC=${F};P=2`, `SRC=${V};P=1`]);
  });

  test("restore a single page from its card", async ({ app }) => {
    await flightAndVisa(app);
    await app.binAt(0);
    expect(await app.idle()).toBe(6);
    await app.card(0).locator(".bin").click();          // restore button is always visible on removed pages
    await expect(app.card(0)).not.toHaveClass(/removed/);
    expect(await app.idle()).toBe(7);
    expect((await app.download()).markers).toEqual(expectedMarkers([[F, 2, 3], [V, 1]]));
  });

  test("bulk: select with checkboxes and Shift-click, then remove selected", async ({ app, page }) => {
    await flightAndVisa(app);
    await app.pickAt(1);
    await app.pickAt(4, { modifiers: ["Shift"] });        // range 1..4
    await expect(page.locator("#pickCount")).toHaveText("4 pages selected");
    await expect(page.locator(".page.picked")).toHaveCount(4);
    await page.getByRole("button", { name: "Remove selected", exact: true }).click();
    await expect(page.locator(".page.removed")).toHaveCount(4);
    await expect(page.locator("#pickCount")).toHaveText("No pages selected");
    expect(await app.idle()).toBe(3);
    expect((await app.download()).markers).toEqual([`SRC=${F};P=1`, `SRC=${F};P=2`, `SRC=${V};P=1`]);
  });

  test("bulk: restore selected and restore all", async ({ app, page }) => {
    await flightAndVisa(app);
    for (const i of [0, 2, 6]) await app.binAt(i);
    expect(await app.idle()).toBe(4);
    await expect(page.locator("#restoreAllBtn")).toHaveText("Restore all removed (3)");
    await app.pickAt(0); await app.pickAt(2);
    await page.getByRole("button", { name: "Restore selected", exact: true }).click();
    await expect(page.locator(".page.removed")).toHaveCount(1);
    await page.locator("#restoreAllBtn").click();
    await expect(page.locator(".page.removed")).toHaveCount(0);
    await expect(page.locator("#restoreAllBtn")).toBeDisabled();
    expect(await app.idle()).toBe(7);
  });

  test("Select these grabs one block; removing it marks the block and page map", async ({ app, page }) => {
    await flightAndVisa(app);
    await page.getByRole("button", { name: "Select pages of Ticket_3_Copies.pdf copy 2" }).click();
    await expect(page.locator("#pickCount")).toHaveText("2 pages selected");
    await page.keyboard.press("Delete");
    await expect(page.locator(".block").nth(1)).toHaveClass(/gone/);
    await expect(page.locator(".block").nth(1).locator(".range")).toHaveText("Removed");
    await expect(page.locator(".block").nth(2).locator(".range")).toHaveText("Pages 3–4");
    await expect(page.locator("#ribbon .seg").nth(1)).toHaveClass(/gone/);
    expect(await app.idle()).toBe(5);
  });

  test("Select all + remove empties the PDF; download is disabled until a restore", async ({ app, page }) => {
    await flightAndVisa(app);
    await page.locator("#selectAllBtn").click();
    await expect(page.locator("#pickCount")).toHaveText("7 pages selected");
    await expect(page.locator("#selectAllBtn")).toBeDisabled();
    await page.locator("#removeSelBtn").click();
    await expect(page.locator("#statusText")).toHaveText("Every page is in the trash");
    await expect(page.locator("#dlBtn")).toBeDisabled();
    await page.locator("#restoreAllBtn").click();
    expect(await app.idle()).toBe(7);
    await expect(page.locator("#dlBtn")).toBeEnabled();
  });

  test("Undo in the toast brings removed pages back", async ({ app, page }) => {
    await flightAndVisa(app);
    await page.locator("#selectAllBtn").click();
    await page.locator("#removeSelBtn").click();
    await expect(page.locator(".page.removed")).toHaveCount(7);
    await page.locator(".toast").filter({ hasText: "Removed 7 pages" }).getByRole("button", { name: "Undo" }).click();
    await expect(page.locator(".page.removed")).toHaveCount(0);
    expect(await app.idle()).toBe(7);
  });

  test("Ctrl/Cmd-click a thumbnail selects instead of opening", async ({ app, page }) => {
    await flightAndVisa(app);
    await app.card(2).locator(".open").click({ modifiers: ["ControlOrMeta"] });
    await expect(app.card(2)).toHaveClass(/picked/);
    await expect(page.locator("#inspector")).not.toHaveClass(/on/);
    await page.keyboard.press("Escape");
    await expect(page.locator("#pickCount")).toHaveText("No pages selected");
  });

  test("inspector: Remove page button and Delete key toggle the page", async ({ app, page }) => {
    await flightAndVisa(app);
    await app.card(4).click();
    await expect(page.locator("#inspNum")).toContainText("5");
    await page.locator("#inspToggle").click();
    await expect(page.locator("#inspNum")).toContainText("Removed");
    await expect(page.locator("#inspNum small")).toHaveText("not in the PDF");
    await expect(page.locator("#canvasWrap")).toHaveClass(/removed/);
    await expect(page.locator("#inspToggle")).toHaveText("Restore page");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#inspNum")).toContainText("5");     // next page slides into slot 5
    await expect(page.locator("#inspNum small")).toHaveText("of 6");
    await page.keyboard.press("Delete");
    await expect(page.locator("#inspNum")).toContainText("Removed");
    expect(await app.idle()).toBe(5);
    await page.keyboard.press("Delete");
    expect(await app.idle()).toBe(6);
  });

  test("removals survive a reload", async ({ app, page }) => {
    await flightAndVisa(app);
    await app.binAt(1); await app.binAt(6);
    expect(await app.idle()).toBe(5);
    await page.reload();
    await expect(app.files()).toHaveCount(2);
    await expect(page.locator(".page.removed")).toHaveCount(2);
    expect(await app.idle()).toBe(5);
    expect((await app.download()).markers).toEqual([`SRC=${F};P=1`, `SRC=${F};P=1`, `SRC=${F};P=2`, `SRC=${F};P=1`, `SRC=${F};P=2`]);
  });

  test("a removal in one copy doesn't touch the other copies; new copies arrive complete", async ({ app }) => {
    await flightAndVisa(app);
    await app.binAt(2);                                   // copy 2, page 1
    await app.stepper(F).plus.click();                    // copy 4 appears
    expect(await app.idle()).toBe(8);
    expect((await app.download()).markers).toEqual([
      `SRC=${F};P=1`, `SRC=${F};P=2`, `SRC=${F};P=2`, `SRC=${F};P=1`, `SRC=${F};P=2`, `SRC=${F};P=1`, `SRC=${F};P=2`, `SRC=${V};P=1`]);
  });
});

test.describe("on-screen actions", () => {
  const ACTIONS = ["Sort A–Z", "Reset copies", "Switch light / dark", "Clear files", "Clear browser storage"];

  test("every action is visible without opening a menu @mobile", async ({ app, page }) => {
    for (const name of ACTIONS) await expect(app.button(name)).toBeVisible();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "More actions" })).toHaveCount(0);
  });

  test("actions are only enabled when they would do something", async ({ app }) => {
    await expect(app.button("Sort A–Z")).toBeDisabled();
    await expect(app.button("Reset copies")).toBeDisabled();
    await expect(app.button("Clear files")).toBeDisabled();
    await expect(app.button("Clear browser storage")).toBeEnabled();
    await expect(app.button("Switch light / dark")).toBeEnabled();

    await app.upload("Transcript.pdf");
    await expect(app.files()).toHaveCount(1);
    await expect(app.button("Clear files")).toBeEnabled();
    await expect(app.button("Sort A–Z")).toBeDisabled();          // nothing to sort with one file
    await app.upload("Housing_Contract.pdf");
    await expect(app.files()).toHaveCount(2);
    await expect(app.button("Sort A–Z")).toBeEnabled();

    await app.stepper("Transcript.pdf").plus.click();
    await expect(app.button("Reset copies")).toBeEnabled();
    await app.action("Reset copies");
    await expect(app.button("Reset copies")).toBeDisabled();
  });

  test("the destructive buttons look destructive", async ({ app }) => {
    for (const name of ["Clear files", "Clear browser storage"]) await expect(app.button(name)).toHaveClass(/ghost-danger/);
  });
});

test.describe("browser storage", () => {
  test("pile, order and copy counts survive a reload", async ({ app, page }) => {
    await app.upload("Housing_Contract.pdf", "Ticket_3_Copies.pdf", "Transcript.pdf");
    await expect(app.files()).toHaveCount(3);
    await app.row("Transcript.pdf").getByLabel(/up$/).click();
    await app.stepper("Transcript.pdf").plus.click();
    await page.fill("#fname", "kept-name");
    const order = await app.fileOrder();
    await app.idle();

    await page.reload();
    await expect(app.files()).toHaveCount(3);
    await expect(page.locator(".toast", { hasText: "Restored 3 files" })).toBeVisible();
    expect(await app.fileOrder()).toEqual(order);
    await expect(app.stepper("Transcript.pdf").value).toHaveText("×2");
    await expect(page.locator("#fname")).toHaveValue("kept-name");
    expect(await app.idle()).toBe(1 + 2 * 3 + 2);
  });

  test("removing a file removes it from storage too", async ({ app, page }) => {
    await app.upload("Housing_Contract.pdf", "Transcript.pdf");
    await expect(app.files()).toHaveCount(2);
    await app.row("Housing_Contract.pdf").getByLabel("Remove Housing_Contract.pdf").click();
    await expect(app.files()).toHaveCount(1);
    await page.reload();
    await expect(app.files()).toHaveCount(1);
    expect(await app.fileOrder()).toEqual(["Transcript.pdf"]);
  });

  test("Clear files asks first; Cancel keeps everything", async ({ app, page }) => {
    await app.upload("Transcript.pdf");
    await expect(app.files()).toHaveCount(1);
    await app.action("Clear files");
    await expect(page.locator("#modal")).toHaveClass(/on/);
    await app.confirm(false);
    await expect(app.files()).toHaveCount(1);
  });

  test("Clear files empties the pile for good", async ({ app, page }) => {
    await uploadDrive(app);
    await app.action("Clear files");
    await expect(page.locator("#modalBody")).toContainText(`All ${DRIVE_NAMES.length} files`);
    await app.confirm(true);
    await expect(app.files()).toHaveCount(0);
    await expect(page.locator("#empty")).toBeVisible();
    await page.reload();
    await page.waitForFunction(() => window.Staple);
    await expect(app.files()).toHaveCount(0);
  });

  test("Clear browser storage wipes IndexedDB, theme and filename", async ({ app, page }) => {
    await app.upload("Transcript.pdf");
    await expect(app.files()).toHaveCount(1);
    await page.fill("#fname", "custom");
    await app.action("Switch light / dark");
    await app.action("Clear browser storage");
    await app.confirm(true);
    await expect(app.files()).toHaveCount(0);
    expect(await page.evaluate(() => ({ ls: localStorage.length, theme: document.documentElement.dataset.theme ?? null })))
      .toEqual({ ls: 0, theme: null });
    await expect(page.locator("#fname")).toHaveValue(/^merged_/);
    expect(await page.evaluate(async () => (await indexedDB.databases()).map(d => d.name))).not.toContain("staple-db");
    await page.reload();
    await expect(app.files()).toHaveCount(0);
  });

  test("theme override persists across reloads", async ({ app, page }) => {
    const dark = await page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches);
    await app.action("Switch light / dark");
    const want = dark ? "light" : "dark";
    await expect(page.locator("html")).toHaveAttribute("data-theme", want);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", want);
  });
});

test.describe("layout", () => {
  test("no horizontal scrolling on a phone @mobile", async ({ app, page }) => {
    await uploadDrive(app);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
