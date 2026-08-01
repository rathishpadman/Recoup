#!/usr/bin/env node
// Assembles the session deck into a single self-contained index.html.
//
// Everything is inlined because the deck has to work in two places that both
// forbid external requests: the published artifact (strict CSP, no external
// hosts) and a laptop with no network in the room. Nothing here fetches.
//
//   node build.mjs
//
// Sources:
//   vendor/*            reveal.js 6.0.1, committed rather than CDN-loaded
//   theme.css           palette, type and spacing derived from /tokens.css
//   slides.html         the authored deck content - the only file worth editing
//
// Output:
//   index.html          pure ASCII, no external references

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(HERE, p), "utf8");

// --- Fold to pure ASCII -----------------------------------------------------
// Without a <head> of our own the charset is left to the browser to guess, and
// Chromium's UTF-8 sniffing masks the failure locally while stricter parsers
// mojibake every dash and arrow. Entities remove the failure mode entirely.
// Not applied to CSS or JS, where entities are never decoded.
const NAMED = {
  "—": "&mdash;", "–": "&ndash;", "·": "&middot;",
  "→": "&rarr;", "←": "&larr;", "≠": "&ne;",
  "§": "&sect;", "≥": "&ge;", "≤": "&le;",
  "×": "&times;", "’": "&rsquo;", "‘": "&lsquo;",
  "“": "&ldquo;", "”": "&rdquo;", "…": "&hellip;",
  " ": "&nbsp;", "‑": "&#8209;", "✓": "&#10003;"
};
const toAscii = (s) =>
  s.replace(/[^\x00-\x7F]/g, (c) => NAMED[c] || `&#${c.codePointAt(0)};`);

const stripNonAscii = (s, label) => {
  const found = s.match(/[^\x00-\x7F]/g);
  if (found) {
    console.warn(`  ! ${label}: ${found.length} non-ASCII char(s) left as-is (not markup)`);
  }
  return s;
};

// --- Assemble ---------------------------------------------------------------
const slides = toAscii(read("slides.html"));
const theme = stripNonAscii(read("theme.css"), "theme.css");

const parts = [
  '<meta charset="utf-8">',
  "<title>Recoup " + NAMED["—"] + " Architecture Walkthrough</title>",
  "<style>", read("vendor/reset.css"), read("vendor/reveal.css"), theme, "</style>",
  '<div class="reveal"><div class="slides">',
  slides,
  "</div></div>",
  "<script>", read("vendor/reveal.js"), "</script>",
  "<script>", read("vendor/notes.js"), "</script>",
  "<script>", read("vendor/zoom.js"), "</script>",
  "<script>", read("init.js"), "</script>"
];

const out = parts.join("\n");
writeFileSync(join(HERE, "index.html"), out);

// --- Report -----------------------------------------------------------------
// External-reference scanning is limited to the markup. Vendored reveal.js
// contains template literals such as href="${url}" that are not references,
// and matching them produced false failures.
const markup = out.slice(0, out.indexOf("<script>"));
const nonAscii = (out.match(/[^\x00-\x7F]/g) || []).length;
const external = (markup.match(/(?:src|href)\s*=\s*["'](?!#)[^"']*["']/g) || []).length;
const sections = (out.match(/<section/g) || []).length;
const fragments = (out.match(/class="[^"]*\bfragment\b/g) || []).length;

console.log(`  index.html   ${(out.length / 1024).toFixed(0)} KB`);
console.log(`  sections     ${sections}`);
console.log(`  fragments    ${fragments}`);
console.log(`  non-ASCII    ${nonAscii}${nonAscii ? "  <-- FAIL" : ""}`);
console.log(`  external     ${external}${external ? "  <-- FAIL" : ""}`);
if (nonAscii || external) process.exitCode = 1;
