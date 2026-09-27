// Verifies the loader-data structural diff: statuses, paths, ancestor-open set,
// removed-key re-insertion in `merged`, and counts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

new Function(readFileSync(new URL("../src/diff.js", import.meta.url), "utf8"))();
const rrDiff = globalThis.rrDiff;

const prev = { user: { name: "Ada", age: 30 }, items: [1, 2], gone: true };
const cur = { user: { name: "Ada", age: 31 }, items: [1, 2, 3], added: "new" };
const { marks, open, merged, counts } = rrDiff(prev, cur);

// changed / added / removed detected at the right paths.
assert.deepEqual(marks.get("/user/age"), { status: "changed", old: 30 }, "changed leaf carries old value");
assert.equal(marks.get("/added").status, "added", "added top-level key");
assert.equal(marks.get("/items/2").status, "added", "added array element");
assert.equal(marks.get("/gone").status, "removed", "removed key");
assert.deepEqual(counts, { added: 2, changed: 1, removed: 1 }, "counts");

// Ancestors of every change are in `open` (root + intermediate objects).
assert.ok(open.has("") && open.has("/user") && open.has("/items"), "ancestor paths opened");

// merged re-inserts the removed key (so it can render struck-through) and keeps current values.
assert.equal(merged.gone, true, "removed key re-inserted into merged");
assert.equal(merged.user.age, 31, "merged carries the new value");
assert.deepEqual(merged.items, [1, 2, 3], "merged array is current");

// Unchanged → no marks, empty open.
const none = rrDiff({ a: 1 }, { a: 1 });
assert.equal(none.marks.size, 0, "no marks when equal");
assert.deepEqual(none.counts, { added: 0, changed: 0, removed: 0 });

// Type change at root counts as one change.
const tc = rrDiff({ x: { a: 1 } }, { x: 5 });
assert.equal(tc.marks.get("/x").status, "changed", "object→scalar is a change");

console.log("diff checks pass");
