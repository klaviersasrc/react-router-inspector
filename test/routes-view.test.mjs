// Verifies the Routes-view builder joins RR matches with keyed loaderData.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

new Function(readFileSync(new URL("../src/routes-view.js", import.meta.url), "utf8"))();
const view = globalThis.rrRoutesView;

// Rich matches + keyed loaderData → hierarchy with per-route data.
const out = view(
  [
    { id: "root", pathname: "/", params: {} },
    { id: "shop", pathname: "/shop", params: {} },
    { id: "shop.product", pathname: "/shop/42", params: { id: "42" } },
  ],
  { root: { user: "ada" }, "shop.product": { sku: 42 } }
);
assert.equal(out.length, 3, "one node per match, top→leaf");
assert.deepEqual(out[0], { id: "root", pathname: "/", loaderData: { user: "ada" } }, "empty params dropped; data joined by id");
assert.deepEqual(out[2].params, { id: "42" }, "non-empty params kept");
assert.deepEqual(out[2].loaderData, { sku: 42 }, "leaf route data joined");
assert.ok(!("loaderData" in out[1]), "route with no data slice omits loaderData");

// Legacy string-id matches still work.
assert.deepEqual(view(["a", "b"], { b: 1 }), [{ id: "a" }, { id: "b", loaderData: 1 }]);

// Empty / missing → null (Routes tab shows its empty state).
assert.equal(view([], {}), null);
assert.equal(view(null, {}), null);

console.log("routes-view checks pass");
