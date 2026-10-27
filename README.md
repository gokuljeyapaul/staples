# Staple

**One PDF to rule the paperwork.**

[![test](https://github.com/gokuljeyapaul/staples/actions/workflows/test.yml/badge.svg)](https://github.com/gokuljeyapaul/staples/actions/workflows/test.yml)

Staple turns a folder of visa chaos — tickets, passports, scans, that one PDF the
government portal encrypted for no reason — into one tidy PDF, in the right order,
with the right number of copies. Entirely in your browser: no server, no account,
no upload button. Your paperwork is nobody else's business.

## Quick start

```
npm install
npm run serve            # http://127.0.0.1:4173/staple.html
```

Any static host will do — it's one HTML file. It also runs happily as a Claude artifact.

## The rule

Name a file `*_N_copies` and it goes into the merged PDF N times. That's the whole product.

| You name it | Staple does |
|---|---|
| `Doc_3_Copies.pdf` | 3 copies, back to back |
| `Plain_Doc.pdf` | 1 copy, like a normal file |
| `Doc_1_copy.pdf` | 1 copy (yes, `_1_copy` works) |
| `Doc_99_copies.pdf` | 99. That's the cap. The embassy can cope. |
| `Doc_3_Copies (1).pdf` | 3 copies — Drive's clash-rename is ignored |
| `Doc_3_copies_final_v2.pdf` | 1 copy — the suffix has to be at the end |

Case doesn't matter (`_3_COPIES` is fine), images follow the same rule, and every
file gets a ± stepper in case the filename lied. **Reset copies** puts the names
back in charge.

## Features

**Merging**
- Repeats `*_N_copies` files N times — automatically, no extra clicks
- Merge order is the queue, top to bottom: drag to reorder, ▲▼ to nudge, **Sort A–Z** for the tidy-minded
- Accepts PDFs, image scans — JPG, PNG, WebP, GIF, BMP, AVIF — each becoming a clean A4 page, centred with a margin, plus ZIPs — including Google Drive "Download folder" zips, nested folders and all
- Junk never makes it in: `__MACOSX`, `.DS_Store` and dotfiles are filtered on arrival
- Duplicates (same name + size) are skipped — and it tells on you
- Corrupt files are flagged and skipped, never silently swallowed
- Unknown types are refused with a nudge — a toast tells you what to export or convert before you wonder where your file went
- Owner-locked PDFs are flattened to images and merged anyway
- Password-protected PDFs are skipped with a reason: Staple merges paperwork, it doesn't crack safes

**Pages**
- Full preview of the merged PDF before you download — every page numbered exactly as it will land
- Page map ribbon: one proportional segment per file copy; click a segment to jump to its block
- Remove pages one at a time or in bulk: checkboxes, Shift-click ranges, per-block **Select these**, **Select all**
- Every removal gets an **Undo**, and removed pages stay visible with a "Removed" stamp until restored
- Removals are per copy — copy 2's page 3 can sit out while copy 1's plays
- Inspector: full-page view with the page's family tree — file, source page, copy, output range
- Click a file in the queue to spotlight its pages everywhere else
- Keyboard-first: Delete removes the selection, arrows flip pages, Escape closes things

**Output & storage**
- Downloads as `merged_YYYY-MM-DD.pdf` by default; name it anything — the filename gets sanitised
- Never stale: the download always reflects the current pile, even clicked mid-debounce
- The whole pile — files, order, copies, removals — survives a reload (IndexedDB)
- Storage meter with a live quota estimate, plus **Clear files** and the nuclear **Clear browser storage**
- Light/dark theme: follows your system until you decide otherwise

## Limitations

In writing, because honesty is a feature:

- **Browser-bound.** No sync, no share links, no "open it on my other laptop". The pile lives in this browser, on this machine.
- **No password cracking.** Password-protected PDFs are skipped. There are tools for that; this isn't one.
- **Locked PDFs become images.** Owner-encrypted PDFs are rasterised to merge, so their text is no longer selectable and the output gets chunkier.
- **HEIC and TIFF: convert first.** iPhone photos: export as JPEG. Everything else image-shaped — JPG, PNG, WebP, GIF, BMP, AVIF — just works.
- **Pages travel with their file.** Reorder files and copies at will, but a lone page can't be moved from one file into another.
- **The rule is literal.** `Ticket_3_copies_final.pdf` gets 1 copy; the suffix must sit at the end.
- **Big piles are heavy.** Merging happens in your tab's memory and browser storage has a quota. A 500 MB scan pile will test both.
- **The first load wants internet.** The libraries come from cdnjs (pinned versions); after that, your browser cache has you.

## Caveats

- **"Clear browser storage" means it.** Staple forgets the pile, the filename, the theme — everything. Your originals on disk were never touched and are fine.
- **Browser storage is a desk, not a filing cabinet.** Keep your originals; treat the pile as a draft.
- **If storage fills up**, new files live only until the tab closes. A toast warns you; physics wins.
- **CI test videos auto-delete after 14 days.** GitHub storage isn't free, and neither is clutter.

## Privacy policy

Short, because there's nothing to hide behind:

- **No server. No account. No analytics. No cookies.** Staple cannot leak your documents, because there is nowhere for them to go.
- Files are read by the browser's File APIs, kept in IndexedDB, merged in your tab's memory and written to a download — all on your machine. Nothing is uploaded, by design and by architecture.
- The only network requests are four pinned libraries from cdnjs and one font from Google Fonts. Those CDNs see an IP address making a request; they never see a byte of your paperwork.
- Want zero external requests? Self-host: one HTML file, `npm run serve`, done.
- Leave any time: **Clear browser storage** wipes IndexedDB and localStorage, permanently.

Full details and a two-minute self-verification guide live in [PRIVACY.md](PRIVACY.md) — and the app links to a live version at [`/privacy.html`](https://gokuljeyapaul.github.io/staples/privacy.html), including how much it can handle.

## Credits

- [pdf-lib](https://pdf-lib.js.org) — does the actual stapling
- [pdf.js](https://mozilla.github.io/pdf.js/) — Mozilla's renderer; counts the pages and keeps its cool around locked PDFs
- [JSZip](https://stuk.github.io/jszip/) — unpacks Drive folders
- [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque) — the typeface doing the heavy lifting
- [Playwright](https://playwright.dev) & [Vitest](https://vitest.dev) — the 280+ automated checks behind the sass
- Every visa application checklist ever written — the true product owner

## Tests

```
npx playwright install   # once
npm test                 # unit + integration, then e2e
npm run test:unit        # vitest: unit + integration only (~2 s)
npm run test:e2e         # playwright: Chromium desktop + Pixel 7 viewport
npm run test:e2e:all     # also Firefox and WebKit
REAL_CDN=1 npx playwright test           # load libraries from cdnjs instead of node_modules
VIDEO=1 npx playwright test              # record a video of every test locally
CHROMIUM_PATH=/path/to/chromium npx playwright test --project=chromium --project=mobile
```

| Layer | Where | What it proves |
|---|---|---|
| Unit | `tests/unit` | The copy rule, page plan, filenames, ordering, sorting. Runs the exact `<script id="staple-core">` block from `staple.html`, so the shipped code is what is tested. |
| Integration | `tests/integration` | Real pdf-lib + pdf.js: every page of the merged PDF is read back and its order checked against an independent oracle. Also locks in library behaviour the app relies on (encrypted-PDF errors, PasswordException) and that the CDN versions in the HTML match `package.json`. |
| E2E | `tests/e2e` | The real app in a browser: uploads, zips, images, locked/corrupt files, steppers, reorder (buttons + drag), page map, inspector, download contents, reload persistence, Clear files, Clear browser storage, mobile layout. Fails on any uncaught page error. |

Every push and PR runs all of it on GitHub Actions (Node 20, Ubuntu): 125 unit and
integration tests, then 157 browser runs across Chromium desktop, Pixel 7 mobile,
Firefox and WebKit — each recorded on video (the `playwright-videos` artifact,
kept 14 days; failures also get the full HTML report with traces). Locally, videos
are kept for failing tests only, or for every test with `VIDEO=1`.

Every test PDF page carries a text marker `SRC=<file>;P=<page>`, so the downloaded PDF's
exact page order is verified, not just its page count.

Binary fixtures (locked PDFs, PNG/JPG scans) live in `tests/fixtures`; regenerate with
`pip install pikepdf pillow && python scripts/make_binary_fixtures.py`.

The "Cannot polyfill DOMMatrix/Path2D" warnings come from pdf.js in Node (no `canvas`
package); tests only extract text there, so they are harmless.

## Structure

- `staple-core` script block: pure logic (no DOM). Add new rules here and unit-test them.
- Main script: UI, storage, rendering. `window.Staple.idle()` resolves when the merged PDF
  matches the current pile; tests use it instead of sleeps.
- `AI` object in the main script: the hook for future AI features (auto-sort by doc type,
  expired-passport detection, missing-doc checklists, cover-page index).