// Verifies session export (shape + header redaction), import validation, round-trip.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

new Function(readFileSync(new URL("../src/session-io.js", import.meta.url), "utf8"))();
const { rrExportSession, rrImportSession, rrRedactHeaders } = globalThis;

const events = [
  { id: "1", kind: "graphql", url: "https://x/gql", reqHeaders: { Authorization: "Bearer secret", "Content-Type": "application/json" }, resHeaders: { "Set-Cookie": "sid=abc" } },
  { id: "2", kind: "data", url: "https://x/a.data", loaderData: { a: 1 } },
];
const logs = [{ level: "info", text: "hi" }];

// Export redacts auth/cookie header VALUES by default, keeps everything else.
const s = rrExportSession(events, logs);
assert.equal(s.format, "rr-inspector-session");
assert.equal(s.version, 1);
assert.ok(s.exportedAt && s.redacted === true);
assert.equal(s.events[0].reqHeaders.Authorization, "[redacted]", "Authorization value stripped");
assert.equal(s.events[0].reqHeaders["Content-Type"], "application/json", "other headers untouched");
assert.equal(s.events[0].resHeaders["Set-Cookie"], "[redacted]", "Set-Cookie value stripped");
assert.deepEqual(s.events[1].loaderData, { a: 1 }, "non-sensitive data preserved");
assert.deepEqual(s.consoleLogs, logs);
// Original events object is not mutated by redaction.
assert.equal(events[0].reqHeaders.Authorization, "Bearer secret", "source not mutated");

// redact:false keeps values.
assert.equal(rrExportSession(events, logs, { redact: false }).events[0].reqHeaders.Authorization, "Bearer secret");

// Import validates shape and round-trips.
const back = rrImportSession(JSON.parse(JSON.stringify(s)));
assert.equal(back.events.length, 2);
assert.deepEqual(back.consoleLogs, logs);
assert.throws(() => rrImportSession({ foo: 1 }), /session file/, "rejects a non-session object");
assert.throws(() => rrImportSession(null), /session file/);

// rrRedactHeaders is case-insensitive and non-destructive.
const r = rrRedactHeaders({ COOKIE: "x", ok: "y" });
assert.deepEqual(r, { COOKIE: "[redacted]", ok: "y" });

console.log("session-io checks pass");
