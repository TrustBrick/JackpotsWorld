#!/usr/bin/env node
// Keeps src/i18n/locales/<lang>/site.json in step with the site copy.
//
// Site copy is wrapped in T("…") / ts("…") with the English text as the key
// (see src/i18n/useSiteText.js). This script finds every such string under
// src/ and, per language:
//
//   node scripts/sync-site-translations.mjs                 report what is missing (exit 1 if anything is)
//   node scripts/sync-site-translations.mjs --export hi     print hi's missing strings as a JSON array
//   node scripts/sync-site-translations.mjs --merge hi f.json
//        merge {"English": "translation", …} from f.json into hi/site.json;
//        a translation whose {{placeholders}} differ from the English is refused
//   node scripts/sync-site-translations.mjs --prune         drop keys no longer used anywhere
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src");
const locales = path.join(src, "i18n", "locales");

const LITERAL = String.raw`('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")`;
const DIRECT = new RegExp(String.raw`\b(?:T|ts)\(\s*` + LITERAL, "g");
const FALLBACK = new RegExp(String.raw`\b(?:T|ts)\([^()'"\n]*?(?:\|\||\?\?)\s*` + LITERAL + String.raw`\s*\)`, "g");

function* files(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== "locales") yield* files(full); }
    else if (/\.(jsx?|tsx?)$/.test(entry.name)) yield full;
  }
}

// The matched text is a JS string literal from our own source; turn it into
// the runtime string the same way the JS engine would.
const unquote = (lit) => {
  const body = lit.slice(1, -1);
  const asJson = '"' + body.replace(/\\'/g, "'").replace(/(^|[^\\])"/g, '$1\\"') + '"';
  return JSON.parse(asJson);
};

function collect() {
  const found = new Set();
  for (const file of files(src)) {
    const code = fs.readFileSync(file, "utf8");
    if (!/\b(?:T|ts)\(/.test(code)) continue;
    for (const re of [DIRECT, FALLBACK]) {
      for (const m of code.matchAll(re)) {
        try { found.add(unquote(m[1])); } catch { console.warn(`could not read ${m[1]} in ${file}`); }
      }
    }
  }
  return [...found].filter(Boolean).sort();
}

const languages = () => fs.readdirSync(locales).filter((l) => l !== "en" && fs.existsSync(path.join(locales, l, "site.json")));
const load = (lang) => JSON.parse(fs.readFileSync(path.join(locales, lang, "site.json"), "utf8") || "{}");
const save = (lang, obj) => {
  const sorted = Object.fromEntries(Object.keys(obj).sort().map((k) => [k, obj[k]]));
  fs.writeFileSync(path.join(locales, lang, "site.json"), JSON.stringify(sorted, null, 2) + "\n");
};
const placeholders = (s) => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort().join(",");

const strings = collect();
const [, , cmd, lang, file] = process.argv;

if (cmd === "--export") {
  const have = load(lang);
  process.stdout.write(JSON.stringify(strings.filter((s) => !(s in have)), null, 2) + "\n");
} else if (cmd === "--merge") {
  const have = load(lang);
  const incoming = JSON.parse(fs.readFileSync(file, "utf8"));
  let added = 0;
  const refused = [];
  for (const [en, tr] of Object.entries(incoming)) {
    if (typeof tr !== "string" || !tr.trim()) continue;
    if (placeholders(en) !== placeholders(tr)) { refused.push(en); continue; }
    have[en] = tr;
    added++;
  }
  save(lang, have);
  console.log(`${lang}: merged ${added}${refused.length ? `, refused ${refused.length} (placeholder mismatch): ${refused.join(" | ")}` : ""}`);
} else if (cmd === "--prune") {
  const used = new Set(strings);
  for (const l of languages()) {
    const have = load(l);
    const kept = Object.fromEntries(Object.entries(have).filter(([k]) => used.has(k)));
    save(l, kept);
    console.log(`${l}: removed ${Object.keys(have).length - Object.keys(kept).length}`);
  }
} else {
  let missingAny = false;
  console.log(`${strings.length} site strings in src/`);
  for (const l of languages()) {
    const have = load(l);
    const missing = strings.filter((s) => !(s in have)).length;
    if (missing) missingAny = true;
    console.log(`  ${l.padEnd(6)} ${missing ? `${missing} missing` : "complete"}`);
  }
  process.exit(missingAny ? 1 : 0);
}
