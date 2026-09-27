// Verifies the Copy-as-cURL builder: method, header filtering, body encoding, quoting.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

new Function(readFileSync(new URL("../src/curl.js", import.meta.url), "utf8"))();
const toCurl = globalThis.rrToCurl;

// GraphQL POST: keeps real headers, drops pseudo + hop-by-hop, JSON body, escapes single quotes.
const gql = toCurl({
  url: "https://api.example.com/graphql", method: "POST",
  reqHeaders: { ":authority": "api.example.com", "Content-Type": "application/json", "Content-Length": "99", Authorization: "Bearer t0k" },
  payload: { body: { query: "query { me { id } }", variables: { a: "it's" } } },
});
assert.ok(gql.startsWith("curl 'https://api.example.com/graphql'"), gql);
assert.ok(gql.includes("-X POST"), "method flag");
assert.ok(gql.includes("-H 'Content-Type: application/json'") && gql.includes("-H 'Authorization: Bearer t0k'"), "real headers kept");
assert.ok(!gql.includes(":authority") && !gql.includes("Content-Length"), "pseudo/hop-by-hop headers dropped");
assert.ok(gql.includes(`--data-raw '{"query":"query { me { id } }","variables":{"a":"it'\\''s"}}'`), "JSON body with quote escaping: " + gql);

// GET: no -X, no body, exact shape.
const get = toCurl({ url: "https://x.test/items?a=1", method: "GET", reqHeaders: { Accept: "application/json" }, payload: { body: null } });
assert.equal(get, "curl 'https://x.test/items?a=1' \\\n  -H 'Accept: application/json'");

// Form bodies (decoded to an object by extractPayload) are re-encoded for the wire.
const form = toCurl({
  url: "https://x.test/login", method: "POST",
  reqHeaders: { "content-type": "application/x-www-form-urlencoded" }, payload: { body: { user: "a b", pw: "1&2" } },
});
assert.ok(form.includes("--data-raw 'user=a+b&pw=1%262'"), "form re-encoded: " + form);

// Router/bridge events have no URL → nothing to copy.
assert.equal(toCurl({ source: "bridge" }), "");

console.log("curl checks pass");
