// Verifies truncated-JSON repair drops the incomplete tail, closes containers,
// and injects the truncation sentinel into the DEEPEST open container.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

new Function(readFileSync(new URL("../src/partial-json.js", import.meta.url), "utf8"))();
const { rrRepairPartialJson: repair, RR_TRUNCATED: T } = globalThis;

// Cut mid-string inside a nested object → sentinel lands in that nested object,
// the completed siblings survive, the incomplete field is dropped.
let v = repair('{"a":1,"b":{"c":2,"d":"untermin');
assert.equal(v.a, 1);
assert.equal(v.b.c, 2);
assert.equal(v.b["…"], T, "sentinel in the deepest open container (b)");
assert.ok(!("d" in v.b), "the incomplete field is dropped");

// Cut inside an array → sentinel appended as the last element.
v = repair('{"items":[1,2,3,{"x":9},{"y":');
assert.deepEqual(v.items.slice(0, 4), [1, 2, 3, { x: 9 }]);
assert.equal(v.items[v.items.length - 1], T, "sentinel is the last array element");

// Cut right after a complete top-level value (deepest open is the root object).
v = repair('{"a":1,"b":2,"c":"tru');
assert.equal(v.a, 1); assert.equal(v.b, 2);
assert.equal(v["…"], T, "sentinel at the root object");

// Deepest container is chosen even when shallower ones are also open.
v = repair('{"outer":{"mid":{"deep":1,"next":');
assert.equal(v.outer.mid.deep, 1);
assert.equal(v.outer.mid["…"], T, "sentinel at the innermost (mid), not outer");
assert.ok(!("…" in v.outer), "outer not marked");

// Valid JSON returns null from repair (caller uses tryJson first); no safe point → null.
assert.equal(repair('{"a":'), null, "no complete element yet → null");
assert.equal(repair("not json"), null);
assert.equal(repair(42), null);

console.log("partial-json checks pass");
