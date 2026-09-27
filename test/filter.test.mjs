// Verifies the event-list filter mini-syntax: fields, status classes, negation, text, hint.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

new Function(readFileSync(new URL("../src/filter.js", import.meta.url), "utf8"))();
const { rrFilterMatch, rrFilterHint } = globalThis;

const ev = { status: 500, method: "POST", kind: "graphql", text: "/a2p/graphql query filters" };

// Field tokens.
assert.ok(rrFilterMatch("status:500", ev));
assert.ok(rrFilterMatch("status:5xx", ev), "status class 5xx");
assert.ok(!rrFilterMatch("status:4xx", ev));
assert.ok(rrFilterMatch("method:post", ev), "method case-insensitive, prefix ok");
assert.ok(rrFilterMatch("kind:graphql", ev));
assert.ok(!rrFilterMatch("kind:api", ev));

// Bare words match the row text; negation excludes.
assert.ok(rrFilterMatch("filters", ev));
assert.ok(!rrFilterMatch("-graphql", { ...ev, text: "graphql here" }), "-word excludes on text");
assert.ok(!rrFilterMatch("-status:5xx", ev), "negated field token excludes");

// AND across terms.
assert.ok(rrFilterMatch("status:5xx method:POST filters", ev));
assert.ok(!rrFilterMatch("status:5xx kind:api", ev));

// Empty query matches everything.
assert.ok(rrFilterMatch("", ev) && rrFilterMatch("   ", ev));

// A GET/200 row.
const ok = { status: 200, method: "GET", kind: "data", text: "/shop/products.data" };
assert.ok(rrFilterMatch("status:2xx method:get", ok));
assert.ok(!rrFilterMatch("status:5xx", ok));

// Hint describes recognized tokens only (plain words omitted unless negated).
assert.equal(rrFilterHint("status:5xx method:POST hello"), "Filtering: status 5xx · method post");
assert.equal(rrFilterHint("-error"), 'Filtering: not "error"');
assert.equal(rrFilterHint("just text"), "", "no hint for plain text");

console.log("filter checks pass");
