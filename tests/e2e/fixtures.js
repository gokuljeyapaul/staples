// Shared Playwright fixtures: serves the CDN libraries from node_modules
// (same pinned versions, so tests are offline and deterministic) and adds helpers.
import { test as base, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { readMarkers } from "../helpers/pdf.js";

const nm = p => fileURLToPath(new URL(`../../node_modules/${p}`, import.meta.url));
const CDN = {
  "pdf-lib/1.17.1/pdf-lib.min.js": nm("pdf-lib/dist/pdf-lib.min.js"),
  "pdf.js/3.11.174/pdf.min.js": nm("pdfjs-dist/build/pdf.min.js"),
  "pdf.js/3.11.174/pdf.worker.min.js": nm("pdfjs-dist/build/pdf.worker.min.js"),
  "jszip/3.10.1/jszip.min.js": nm("jszip/dist/jszip.min.js"),
};
export const GEN = fileURLToPath(new URL("../.generated/", import.meta.url));
export const gen = (...names) => names.map(n => GEN + n);

export const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    if (!process.env.REAL_CDN) {
      await page.route(/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/(.+)$/, async route => {
        const key = route.request().url().split("/ajax/libs/")[1];
        if (!CDN[key]) { errors.push("Unmapped CDN request: " + key); return route.abort(); }
        route.fulfill({ body: await readFile(CDN[key]), contentType: "text/javascript" });
      });
      await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    }
    page.errors = errors;
    await use(page);
    expect(errors, "uncaught page errors").toEqual([]);
  },
  app: async ({ page }, use) => {
    await page.goto("/staple.html");
    await page.waitForFunction(() => window.Staple && window.StapleCore);
    await use(new App(page));
  },
});
export { expect };

export class App {
  constructor(page) { this.page = page; }
  files() { return this.page.locator("#fileList .file"); }
  row(name) { return this.files().filter({ has: this.page.locator(".name b", { hasText: new RegExp(`^${name.replace(/[.()]/g, "\\$&")}$`) }) }); }
  async upload(...names) {
    const before = await this.files().count();
    await this.page.setInputFiles("#fileInput", gen(...names));
    return before;
  }
  /** Waits until the merged PDF matches the current pile; returns its page count. */
  async idle() { return this.page.evaluate(() => window.Staple.idle()); }
  async fileOrder() { return this.page.locator("#fileList .file .name b").allTextContents(); }
  async download() {
    const [dl] = await Promise.all([this.page.waitForEvent("download"), this.page.click("#dlBtn")]);
    const bytes = await readFile(await dl.path());
    return { name: dl.suggestedFilename(), bytes, markers: await readMarkers(bytes) };
  }
  button(name) { return this.page.getByRole("button", { name, exact: true }); }
  async action(name) { await this.button(name).click(); }
  async confirm(yes = true) { await this.page.locator(yes ? "#modalYes" : "#modalNo").click(); }
  card(i) { return this.page.locator(".page").nth(i); }
  async binAt(i) { await this.card(i).hover(); await this.card(i).locator(".bin").click(); }
  async pickAt(i, opts) { await this.card(i).hover(); await this.card(i).locator(".pick").click(opts); }
  stepper(name) { const r = this.row(name); return { plus: r.getByLabel("One more copy"), minus: r.getByLabel("One fewer copy"), value: r.locator(".stepper output") }; }
}
