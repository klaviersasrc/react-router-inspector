import assert from "node:assert/strict";
import siteAccess from "../src/site-access.js";

assert.equal(
  siteAccess.originPattern("https://qa.example.test/app/page?filter=open"),
  "https://qa.example.test/*",
);
assert.equal(siteAccess.originPattern("chrome://extensions"), null);
assert.equal(siteAccess.isBuiltInOrigin("https://localhost:8080/app"), true);
assert.equal(siteAccess.isBuiltInOrigin("https://app.localhost/app"), true);
assert.equal(siteAccess.isBuiltInOrigin("https://qa.example.test/app"), false);

const scripts = siteAccess.registrations("https://qa.example.test/*");
assert.equal(scripts.length, 2);
assert.deepEqual(scripts.map((script) => script.world), ["ISOLATED", "MAIN"]);
assert.deepEqual(scripts.map((script) => script.runAt), ["document_start", "document_start"]);
assert.ok(scripts.every((script) => script.persistAcrossSessions));

const calls = [];
const chromeApi = {
  permissions: {
    async contains(details) {
      calls.push(["contains", details]);
      return true;
    },
    async request(details) {
      calls.push(["request", details]);
      return true;
    },
  },
  scripting: {
    async getRegisteredContentScripts(details) {
      calls.push(["get", details]);
      return [];
    },
    async unregisterContentScripts(details) {
      calls.push(["unregister", details]);
    },
    async registerContentScripts(details) {
      calls.push(["register", details]);
    },
  },
};

assert.equal(await siteAccess.hasPermission(chromeApi, "https://qa.example.test/*"), true);
assert.equal(await siteAccess.requestAndRegister(chromeApi, "https://qa.example.test/*"), true);
assert.ok(calls.some(([name]) => name === "request"));
assert.ok(calls.some(([name]) => name === "register"));

console.log("site access checks pass");
