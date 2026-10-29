# Privacy

**Staple cannot send your documents anywhere, because nowhere exists to send them.**

Staple is one static HTML file served by GitHub Pages. There is no backend, no
database, no account system, no upload endpoint. Nothing you open in Staple
leaves your device — not for merging, not for storage, not ever.

## What happens to your files

1. Your browser reads them with the standard File APIs.
2. They are kept in your browser's IndexedDB (`staple-db`) so the pile survives a reload.
3. Merging happens in your tab's memory, using pdf-lib.
4. The merged PDF is written straight to a download — created locally, saved locally.

Steps 2–4 are all local. Don't take our word for any of this — every claim on
this page is verifiable in about two minutes, using only your browser.

## The only network requests Staple makes

| Request | Why |
|---|---|
| Four pinned files from `cdnjs.cloudflare.com` (pdf-lib, pdf.js + its worker, JSZip) | The app's code. Loaded once, then served from your browser's cache. |
| One font from Google Fonts | The typeface. |
| One pinned HEIC decoder from `cdnjs.cloudflare.com`, fetched only if you drop an iPhone photo, then cached | heic2any — every browser except Safari needs it to decode HEIC. The photo itself is decoded locally. |
| One pinned spreadsheet reader from `cdnjs.cloudflare.com`, fetched only if you drop an .xlsx, then cached | SheetJS — reads cell values locally. |

Those CDNs see an IP address making a request — as every site you visit does.
They never see your documents. GitHub Pages, like any website host, keeps
standard access logs (IP, timestamp) for serving the page itself.

Two more guarantees, both machine-checked:

- **The browser refuses to leak.** The app ships a strict Content-Security-Policy
  with `connect-src 'none'`: no fetch, XHR or WebSocket to anywhere can succeed,
  even if the code tried. The e2e suite fails if any request goes beyond the
  pinned files above. Script sources are pinned to this file and cdnjs; the one
  allowance is `unsafe-eval`, needed by the HEIC decoder's WASM glue —
  connections stay forbidden regardless.
- **It works offline.** After the first visit a network-first service worker
  answers from its cache only when the network fails. Online behaviour is
  identical to a browser without it, and it never sends anything.

## Where your data lives

- **IndexedDB database `staple-db`** — your files, their order, copy counts, page removals.
- **localStorage keys `staple-theme` and `staple-fname`** — your theme choice and download filename.

That is the complete list. Nothing else is stored, anywhere, by anything.

## Verify it yourself

1. **No uploads.** Open DevTools → **Network**, then drag a document in and watch
   every request. None of them contains your file. The download is built locally
   from a Blob — an upload-then-download round trip doesn't exist in the code.
2. **Local storage only.** DevTools → **Application** → **IndexedDB** → `staple-db`.
   That's your pile, sitting in your own browser. Nothing syncs it anywhere.
3. **Delete everything.** The **Clear browser storage** button wipes IndexedDB and
   localStorage completely. No copy is kept behind, because there is nowhere to keep one.
4. **Read the code.** Everything Staple runs is one public file —
   [`staple.html`](staple.html). The site you use is the code in this repository,
   line for line.

## What Staple doesn't have

No accounts, no cookies, no analytics, no trackers, no error reporting, and no
third-party scripts beyond the pinned libraries listed above. We can't tell you
how many people use Staple — and we think that's how a tool that handles your
paperwork should be.

## Self-hosting

It's one file. Run `npm run serve`, or drop `staple.html` onto any static host of
your own — then not even this repository's host sees you.

Questions? Open an issue.