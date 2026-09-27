// Verifies the JSON tree collapses long/multi-line strings behind a twisty while
// leaving short strings inline. Loads the browser IIFE against a tiny DOM stub.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function mkEl() {
  const el = {
    className: "",
    _text: "",
    style: {},
    kids: [],
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      contains(c) { return this._s.has(c); },
      remove(c) { this._s.delete(c); },
      toggle(c) { if (this._s.has(c)) { this._s.delete(c); return false; } this._s.add(c); return true; },
    },
    appendChild(c) { this.kids.push(c); return c; },
    _l: {},
    addEventListener(ev, fn) { (this._l[ev] ||= []).push(fn); },
    click() { for (const f of this._l.click || []) f({ stopPropagation() {} }); },
  };
  Object.defineProperty(el, "textContent", { get() { return this._text; }, set(v) { this._text = v; } });
  return el;
}
const copied = [];
globalThis.navigator = { clipboard: { writeText: async (t) => { copied.push(t); } } };
globalThis.window = {};
globalThis.document = { createElement: () => mkEl(), createTextNode: (t) => ({ textContent: t, kids: [] }) };

new Function(readFileSync(new URL("../src/json-tree.js", import.meta.url), "utf8"))();

// Walk the stub tree, collecting every node's text.
function texts(el, out = []) {
  if (el && el.textContent) out.push(el.textContent);
  for (const k of (el && el.kids) || []) texts(k, out);
  return out;
}
const twisties = (el) => texts(el).filter((t) => t === "▸" || t === "▾");

// A multi-line GraphQL-ish query → collapsed (one "▸"), full text present.
const longQuery = "query Filters($x: A!) {\n  a\n  b\n  c\n}";
const longTree = window.renderJsonTree({ query: longQuery });
const longTexts = texts(longTree);
assert.ok(longTexts.includes("▸"), "long string should render a collapsed twisty");
assert.ok(longTexts.some((t) => t === longQuery), "expanded block should hold the full string");
assert.ok(longTexts.some((t) => /\(\d+ chars\)/.test(t)), "preview should show a char count");

// A very long single-line string (no newlines) → also collapses.
const longFlat = window.renderJsonTree({ blob: "x".repeat(200) });
assert.ok(texts(longFlat).includes("▸"), "a >120-char single-line string should collapse too");

// A short string → inline leaf, no collapsed twisty (only the root container's ▾).
const shortTree = window.renderJsonTree({ s: "hi" });
assert.equal(twisties(shortTree).filter((t) => t === "▸").length, 0, "short string must not collapse");
assert.ok(texts(shortTree).some((t) => t === '"hi"'), "short string stays inline as JSON");

// Collapsed previews are Chrome-style `key: value` pairs, not just key names.
const has = (tree, s) => texts(tree).some((t) => t.includes(s));
const objTree = window.renderJsonTree({ q: { projectWildcard: "ABC", objectClass: 12, ok: true } });
assert.ok(has(objTree, 'projectWildcard: "ABC"'), "preview shows key: value for strings");
assert.ok(has(objTree, "objectClass: 12") && has(objTree, "ok: true"), "numbers/booleans inline");
// Nested containers summarize (on a fixture narrow enough not to hit the width budget).
const nestTree = window.renderJsonTree({ q: { nested: { z: 1 }, list: [1, 2] } });
assert.ok(has(nestTree, "nested: {…}") && has(nestTree, "list: Array(2)"), "nested containers summarized");

// Truncated by WIDTH with a trailing …, not by a fixed key count.
const wide = {}; for (let i = 0; i < 12; i++) wide["key" + i] = "value-" + i;
const wideTree = window.renderJsonTree({ w: wide });
assert.ok(texts(wideTree).some((t) => t.startsWith("{key0:") && t.endsWith("…}") && t.length <= 80), "wide object preview truncates by width");

// Long string values are clipped inside the preview.
const clipTree = window.renderJsonTree({ c: { s: "x".repeat(80) } });
assert.ok(has(clipTree, '"' + "x".repeat(24) + '…"'), "long strings clipped in preview");

// Arrays preview as (n) [v1, v2, …]; empties stay compact.
assert.ok(has(window.renderJsonTree({ a: [1, "two", null] }), '(3) [1, "two", null]'), "array preview shows values");
assert.ok(has(window.renderJsonTree({ e: {} }), "{}") && has(window.renderJsonTree({ e: [] }), "[]"), "empty containers compact");

// Hover-copy: every row gets a ⧉ button; containers copy pretty JSON, strings copy raw text.
const findCp = (el, out = []) => { if (el && String(el.className || "").includes("cp")) out.push(el); for (const k of (el && el.kids) || []) findCp(k, out); return out; };
const cps = findCp(window.renderJsonTree({ a: { b: 1 }, s: "plain" })); // walk order: root, a, b, s
assert.ok(cps.length >= 4, "copy buttons on root and every row");
copied.length = 0; cps[1].click(); await new Promise((r) => setTimeout(r, 0));
assert.equal(copied[0], JSON.stringify({ b: 1 }, null, 2), "container copies pretty JSON");
copied.length = 0; cps[3].click(); await new Promise((r) => setTimeout(r, 0));
assert.equal(copied[0], "plain", "string copies the raw (unquoted) text");
// Map / Set / BigInt / Date serialize sanely for Copy JSON.
assert.equal(JSON.stringify(window.rrToPlain(new Map([["k", new Set([1n, new Date(0)])]]))), '{"k":["1","1970-01-01T00:00:00.000Z"]}');

console.log("json-tree checks pass");
