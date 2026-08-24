/* Catches the two classes of bug a Vite build happily ships:
     1. a name referenced but never declared or imported anywhere
        (the missing-import white screen), and
     2. a const/let read in the same scope ABOVE its own declaration
        (the temporal-dead-zone white screen).
   Both parse and bundle cleanly; both blow up at runtime.

   Vite type-checks nothing and bundles happily around both, so neither shows
   up until a customer opens the page and gets a blank screen. This has bitten
   ChatBot.jsx three times.

   Usage: npm run check            (walks src/)
          node scripts/check-identifiers.cjs <file> [...]                    */
const fs = require("fs");
const parser = require("@babel/parser");

const GLOBALS = new Set([
  "window","document","console","fetch","setTimeout","clearTimeout","setInterval",
  "clearInterval","Math","JSON","Object","Array","String","Number","Boolean","Date",
  "Promise","Error","Map","Set","WeakMap","RegExp","Symbol","navigator","localStorage",
  "sessionStorage","location","history","FormData","Blob","File","FileReader","URL",
  "URLSearchParams","AbortController","WebSocket","RTCPeerConnection","MediaStream",
  "Audio","Image","IntersectionObserver","ResizeObserver","MutationObserver","undefined",
  "NaN","Infinity","requestAnimationFrame","cancelAnimationFrame","alert","confirm",
  "process","globalThis","structuredClone","queueMicrotask","performance","Intl","parseInt",
  "parseFloat","isNaN","isFinite","encodeURIComponent","decodeURIComponent","btoa","atob",
  "CustomEvent","Event","AudioContext","webkitAudioContext","matchMedia","top","self",
  "crypto","MediaRecorder","Notification","screen","frames","parent","AbortSignal",
  "XMLHttpRequest","RTCIceCandidate","RTCSessionDescription","RTCPeerConnectionIceEvent",
  "Headers","Request","Response","TextEncoder","TextDecoder","DOMParser","Node","Element",
  "HTMLElement","CanvasRenderingContext2D","Worker","BroadcastChannel","IntlSegmenter",
]);

const FN = new Set(["FunctionDeclaration","FunctionExpression","ArrowFunctionExpression",
                    "ObjectMethod","ClassMethod"]);
const BLOCK = new Set(["BlockStatement","ForStatement","ForInStatement","ForOfStatement",
                       "SwitchStatement","CatchClause","Program"]);

function patternNames(node, out) {
  if (!node) return out;
  switch (node.type) {
    case "Identifier": out.push(node); break;
    case "ObjectPattern": node.properties.forEach(pr =>
      patternNames(pr.type === "RestElement" ? pr.argument : pr.value, out)); break;
    case "ArrayPattern": node.elements.forEach(e => patternNames(e, out)); break;
    case "AssignmentPattern": patternNames(node.left, out); break;
    case "RestElement": patternNames(node.argument, out); break;
  }
  return out;
}

function analyse(file) {
  const src = fs.readFileSync(file, "utf8");
  const ast = parser.parse(src, {
    sourceType: "module",
    plugins: ["jsx","optionalChaining","nullishCoalescingOperator","classProperties",
              "objectRestSpread","dynamicImport","importMeta"],
  });

  const unresolved = [];
  const tdz = [];

  function newScope(parent, kind) {
    return { parent, kind, vars: new Map() };
  }
  function declare(scope, idNode, kind) {
    // let/const/class live in the nearest block; var and function declarations
    // climb to the nearest function or module scope.
    let target = scope;
    if (kind === "var" || kind === "func") {
      while (target.kind === "block" && target.parent) target = target.parent;
    }
    if (!target.vars.has(idNode.name)) {
      target.vars.set(idNode.name, { kind, start: idNode.start, scope: target });
    }
  }
  function resolve(scope, name) {
    for (let s = scope; s; s = s.parent) if (s.vars.has(name)) return s.vars.get(name);
    return null;
  }
  // True when the reference runs later than the surrounding code -- i.e. it is
  // inside a function nested below the scope that owns the binding. Reading an
  // outer const from such a callback is fine; reading it inline is not.
  function deferredBetween(fromScope, bindingScope) {
    for (let s = fromScope; s && s !== bindingScope; s = s.parent) {
      if (s.kind === "function") return true;
    }
    return false;
  }

  // Collect declarations belonging directly to `scope` from a statement list,
  // descending through blocks for var/function but never into nested functions.
  function hoist(node, scope, topLevel) {
    if (!node || typeof node.type !== "string") return;
    if (FN.has(node.type) && !topLevel) {
      if (node.type === "FunctionDeclaration" && node.id) declare(scope, node.id, "func");
      return; // its body is a different scope
    }
    if (node.type === "VariableDeclaration") {
      const kind = node.kind === "var" ? "var" : node.kind;
      node.declarations.forEach(d => patternNames(d.id, []).forEach(id => declare(scope, id, kind)));
    }
    if (node.type === "ClassDeclaration" && node.id) declare(scope, node.id, "let");
    if (node.type === "ImportDeclaration") {
      node.specifiers.forEach(sp => declare(scope, sp.local, "import"));
      return;
    }
    for (const k of Object.keys(node)) {
      if (k === "loc") continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach(c => c && typeof c.type === "string" && hoist(c, scope, false));
      else if (v && typeof v.type === "string") hoist(v, scope, false);
    }
  }

  // `deferredDepth` counts how many function boundaries a reference sits behind.
  // Anything >0 executes later, so reading an outer const from inside it is fine.
  function walk(node, parent, scope, deferredDepth) {
    if (!node || typeof node.type !== "string") return;

    if (FN.has(node.type)) {
      const fs_ = newScope(scope, "function");
      if (node.id) fs_.vars.set(node.id.name, { kind: "func", start: node.id.start, scope: fs_ });
      node.params.forEach(p => patternNames(p, []).forEach(id =>
        fs_.vars.set(id.name, { kind: "param", start: id.start, scope: fs_ })));
      // The body's own BlockStatement creates the scope its let/const live in;
      // hoist() climbs to fs_ for var and function declarations.
      if (node.body && node.body.type !== "BlockStatement") {
        // Expression-bodied arrow: no block, so it resolves against fs_ direct.
      }
      node.params.forEach(p => walk(p, node, fs_, deferredDepth + 1));
      walk(node.body, node, fs_, deferredDepth + 1);
      return;
    }

    if (BLOCK.has(node.type) && node.type !== "Program") {
      const bs = newScope(scope, "block");
      if (node.type === "CatchClause" && node.param) {
        patternNames(node.param, []).forEach(id =>
          bs.vars.set(id.name, { kind: "param", start: id.start, scope: bs }));
      }
      const stmts = node.body && node.body.body ? node.body.body : (node.body || []);
      (Array.isArray(stmts) ? stmts : [stmts]).forEach(st =>
        st && typeof st.type === "string" && hoist(st, bs, false));
      for (const k of Object.keys(node)) {
        if (k === "loc") continue;
        const v = node[k];
        if (Array.isArray(v)) v.forEach(c => c && typeof c.type === "string" && walk(c, node, bs, deferredDepth));
        else if (v && typeof v.type === "string") walk(v, node, bs, deferredDepth);
      }
      return;
    }

    if (node.type === "ImportDeclaration") return;
    if (node.type === "ExportNamedDeclaration" || node.type === "ExportAllDeclaration") {
      // `export ... from "mod"` re-exports without creating a local binding.
      if (node.source) return;
      if (node.declaration) { walk(node.declaration, node, scope, deferredDepth); return; }
      // Check only the local half of each `local as Exported` pair.
      (node.specifiers || []).forEach(sp => sp.local && walk(sp.local, node, scope, deferredDepth));
      return;
    }

    if (node.type === "Identifier" || node.type === "JSXIdentifier") {
      if (parent) {
        if ((parent.type === "MemberExpression" || parent.type === "OptionalMemberExpression")
            && parent.property === node && !parent.computed) return;
        if ((parent.type === "ObjectProperty" || parent.type === "ObjectMethod" ||
             parent.type === "ClassMethod" || parent.type === "ClassProperty")
            && parent.key === node && !parent.computed) return;
        if (parent.type === "JSXAttribute" && parent.name === node) return;
        if (parent.type === "JSXMemberExpression" && parent.property === node) return;
        if (parent.type === "VariableDeclarator" && parent.id === node) return;
        if (parent.type === "MetaProperty") return;
        if (FN.has(parent.type) && parent.id === node) return;
      }
      if (node.type === "JSXIdentifier" && /^[a-z]/.test(node.name)) return;

      const binding = resolve(scope, node.name);
      if (!binding) {
        if (!GLOBALS.has(node.name)) {
          unresolved.push(`${node.name}  (line ${node.loc.start.line})`);
        }
        return;
      }
      // Real TDZ: a let/const read above its own declaration, in code that runs
      // inline rather than inside a callback defined after it.
      if ((binding.kind === "let" || binding.kind === "const") &&
          node.start < binding.start && !deferredBetween(scope, binding.scope)) {
        tdz.push(`${node.name}  read line ${node.loc.start.line}, declared later`);
      }
      return;
    }

    for (const k of Object.keys(node)) {
      if (k === "loc") continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach(c => c && typeof c.type === "string" && walk(c, node, scope, deferredDepth));
      else if (v && typeof v.type === "string") walk(v, node, scope, deferredDepth);
    }
  }

  const top = newScope(null, "module");
  ast.program.body.forEach(st => hoist(st, top, false));
  ast.program.body.forEach(st => walk(st, ast.program, top, 0));

  return { unresolved: [...new Set(unresolved)], tdz: [...new Set(tdz)] };
}

function walkDir(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = require("path").join(dir, entry.name);
    if (entry.isDirectory()) walkDir(full, out);
    else if (/\.(js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const targets = process.argv.length > 2
  ? process.argv.slice(2)
  : walkDir("src", []);

let failed = 0;
let checked = 0;
for (const file of targets) {
  checked++;
  const { unresolved, tdz } = analyse(file);
  const bad = unresolved.length + tdz.length;
  failed += bad;
  if (bad) {
    console.log(`FAIL  ${file}`);
    unresolved.forEach(u => console.log(`        unresolved: ${u}`));
    tdz.forEach(t => console.log(`        TDZ:        ${t}`));
  }
}
console.log("");
console.log(failed
  ? `${failed} problem(s) across ${checked} file(s)`
  : `clean - ${checked} file(s) checked`);
process.exit(failed ? 1 : 0);
