/**
 * Build the installable userscript: bundle `src/main.ts` and prepend the
 * Tampermonkey/Violentmonkey metadata block.
 *
 * Run with `bun run build`.
 */
export {};

const VERSION = "0.1.0";

const banner = `// ==UserScript==
// @name         auto-ez
// @namespace    https://github.com/auto-ez
// @version      ${VERSION}
// @description  Auto-send chat messages on lichess.org under configurable conditions (e.g. "ez" on a win by flag).
// @author       auto-ez
// @match        https://lichess.org/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @noframes
// ==/UserScript==
`;

const result = await Bun.build({
  entrypoints: ["./src/main.ts"],
  target: "browser",
  minify: false,
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

const [artifact] = result.outputs;
if (!artifact) {
  console.error("build produced no output");
  process.exit(1);
}

const code = await artifact.text();
const outPath = "./dist/auto-ez.user.js";
await Bun.write(outPath, `${banner}\n${code}`);
console.log(`Wrote ${outPath} (${(code.length / 1024).toFixed(1)} KiB)`);
