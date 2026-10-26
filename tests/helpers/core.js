// Loads the exact <script id="staple-core"> block from staple.html,
// so unit tests exercise the shipped code rather than a copy of it.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const HTML_PATH = fileURLToPath(new URL("../../staple.html", import.meta.url));
export const html = () => readFileSync(HTML_PATH, "utf8");

export function loadCore() {
  const m = html().match(/<script id="staple-core">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('staple.html has no <script id="staple-core"> block');
  const sandbox = {};
  new Function("window", m[1])(sandbox);
  if (!sandbox.StapleCore) throw new Error("staple-core did not define StapleCore");
  return sandbox.StapleCore;
}

/** Minimal file record as the app stores it. */
export const file = (id, name, pages, extra = {}) => ({
  id, name, size: 1000, pages, autoCopies: loadCore().copiesFromName(name), copies: null, error: null, ...extra,
});
