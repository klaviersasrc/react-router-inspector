// Verifies group-by-navigation, especially the off-by-one fix: a navigation's
// loader fetches (which timestamp BEFORE the nav settles) group under THAT nav.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

new Function(readFileSync(new URL("../src/group.js", import.meta.url), "utf8"))();
const group = globalThis.rrGroupByNav;

const T = (s) => new Date(2026, 0, 1, 0, 0, s).toISOString();

// Timeline: nav A settles at :05 (started :01, loader fired :03); nav B settles at
// :12 (started :08, loader fired :10); a post-nav telemetry POST fires at :06.
const events = [
  { id: "navA", nav: true, time: T(5), navStart: T(1) },
  { id: "loaderA", time: T(3) },     // loader for A — before A settles, after A start
  { id: "postA", time: T(6) },       // fired after A settled, before B started
  { id: "navB", nav: true, time: T(12), navStart: T(8) },
  { id: "loaderB", time: T(10) },    // loader for B
];
const { leading, groups } = group(events);

assert.equal(leading.length, 0, "nothing before the first nav start");
assert.equal(groups.length, 2);
assert.equal(groups[0].header.id, "navA");
assert.deepEqual(groups[0].members.map((m) => m.id).sort(), ["loaderA", "postA"], "A's loader + post-nav call group under A");
assert.equal(groups[1].header.id, "navB");
assert.deepEqual(groups[1].members.map((m) => m.id), ["loaderB"], "B's loader groups under B, not A");

// Without navStart it degrades to completion-time windows (loader lands in leading/prev).
const noStart = [
  { id: "nav", nav: true, time: T(5) },
  { id: "loader", time: T(3) }, // before nav completion, no navStart → leading
];
const g2 = group(noStart);
assert.deepEqual(g2.leading.map((m) => m.id), ["loader"], "no navStart → completion-time fallback");
assert.equal(g2.groups[0].members.length, 0);

// Navs are ordered by start regardless of array order.
const g3 = group([{ id: "b", nav: true, time: T(20), navStart: T(15) }, { id: "a", nav: true, time: T(9), navStart: T(2) }]);
assert.deepEqual(g3.groups.map((x) => x.header.id), ["a", "b"]);

console.log("group checks pass");
