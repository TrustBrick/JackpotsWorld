#!/usr/bin/env node
// Fails when the site stores something in the browser that the Cookies Policy
// page does not mention.
//
// The policy (src/pages/CookiesPolicy.jsx) calls itself the honest inventory of
// everything kept on the visitor's device, so a new localStorage / sessionStorage
// key that is not listed there is a bug in the policy. This finds every key the
// public site reads or writes by name and checks each one is named in the policy
// table.
//
//   node scripts/check-cookie-policy.mjs        exit 1 and list the strays if any
//
// Keys are found by:
//   - a string literal passed straight to localStorage / sessionStorage
//     .getItem / .setItem / .removeItem
//   - a constant named ...KEY / ...STORAGE / ...PREFIX holding a string,
//     e.g. const ANON_KEY = "jw_anon_id"
//   - config/session.js, which declares the sign-in token names and the lists
//     wiped on logout as plain objects and arrays
//
// Back Office screens (src/admin) are staff-only and not scanned. Add to IGNORE
// only a name that is not stored on the visitor's device.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src");
const policyFile = path.join(src, "pages", "CookiesPolicy.jsx");
const sessionConfig = path.join(src, "config", "session.js");

const IGNORE = new Set([
  "spin_last_shown",   // only ever deleted on logout (config/session.js); nothing writes it
]);

function* files(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "locales" && full !== path.join(src, "admin")) yield* files(full);
    } else if (/\.(jsx?|tsx?)$/.test(entry.name) && full !== policyFile) {
      yield full;
    }
  }
}

const STORAGE_CALL = /\b(?:local|session)Storage\s*\.\s*(?:get|set|remove)Item\(\s*(['"`])([A-Za-z0-9_.:-]+)\1/g;
const KEY_CONSTANT = /\b[A-Z_]*(?:KEY|STORAGE|PREFIX)[A-Z_]*\s*=\s*(['"`])([A-Za-z0-9_.:-]+)\1/g;
const KEY_PROPERTY = /\b\w*Key\s*:\s*(['"`])([A-Za-z0-9_.:-]+)\1/g;       // accessKey: 'access'
const KEY_LISTS = /\b(?:local|session)\s*:\s*\[([^\]]*)\]/g;              // local: ['spin_last_shown']
const LITERAL = /(['"`])([A-Za-z0-9_.:-]+)\1/g;

const found = new Map(); // key -> first file
const note = (key, file) => {
  if (key && !IGNORE.has(key) && !found.has(key)) found.set(key, path.relative(root, file));
};

for (const file of files(src)) {
  const code = fs.readFileSync(file, "utf8");
  for (const m of code.matchAll(STORAGE_CALL)) note(m[2], file);
  for (const m of code.matchAll(KEY_CONSTANT)) note(m[2], file);
  if (file === sessionConfig) {
    for (const m of code.matchAll(KEY_PROPERTY)) note(m[2], file);
    for (const m of code.matchAll(KEY_LISTS)) {
      for (const lit of m[1].matchAll(LITERAL)) note(lit[2], file);
    }
  }
}

// What the policy table names: every token in each `name: '...'` entry. A token
// ending in "*" (jw_video_session:*) lists everything with that prefix.
const policy = fs.readFileSync(policyFile, "utf8");
const names = [...policy.matchAll(/\bname:\s*'([^']+)'/g)].flatMap(m => m[1].split(/\s+/)).filter(Boolean);
const exact = new Set(names.filter(n => !n.endsWith("*")));
const prefixes = names.filter(n => n.endsWith("*")).map(n => n.slice(0, -1));
const listed = (key) => exact.has(key) || prefixes.some(p => key.startsWith(p));

const missing = [...found].filter(([key]) => !listed(key));
if (missing.length) {
  console.error(`${missing.length} stored item(s) are not in the Cookies Policy:`);
  for (const [key, file] of missing) console.error(`  ${key}   (${file})`);
  console.error("\nAdd it to a row of COOKIES_TABLE in src/pages/CookiesPolicy.jsx.");
  process.exit(1);
}
console.log(`Cookies Policy covers all ${found.size} stored items found in src/.`);
