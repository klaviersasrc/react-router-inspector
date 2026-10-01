// Verifies server-side (ssr) capture survives a later replacement of globalThis.fetch
// (React Router's installGlobals / an SSR rebuild). The plugin must re-wrap the new
// fetch on the next request, not give up after the first patch.
import rrInspector from "./vite-plugin-rr-inspector.mjs";

const realFetch = globalThis.fetch;
const mws = [];
// Capture both use(handler) and use(path, handler) registrations.
const fakeServer = { middlewares: { use: (a, b) => mws.push(b ? { path: a, handler: b } : { path: null, handler: a }) } };

const makeFetch = (tag) => async () =>
  new Response(JSON.stringify({ tag }), { status: 200, headers: { "content-type": "application/json" } });

globalThis.fetch = makeFetch("orig");

const plugin = rrInspector();
plugin.configResolved({ base: "/" });
plugin.configureServer(fakeServer); // patches globalThis.fetch (wraps "orig")

// Connect an SSE client so broadcasts are written out.
const written = [];
const fakeRes = { writeHead() {}, write: (s) => written.push(s), end() {} };
mws.find((m) => m.path === "/__rr-inspector/logs").handler({ on() {} }, fakeRes);

// (1) call through the wrapper — captured
await globalThis.fetch("https://api.example.com/a");

// Simulate the framework REPLACING global fetch with a fresh, unwrapped function.
globalThis.fetch = makeFetch("replaced");

// A subsequent request runs the per-request re-assert middleware, which must re-wrap.
const reassert = mws.find((m) => m.path === null);
reassert.handler({}, {}, () => {});

// (2) call through the (replaced, then re-wrapped) fetch — must also be captured
await globalThis.fetch("https://api.example.com/b");

globalThis.fetch = realFetch;

const net = written
  .filter((w) => w.startsWith("data: "))
  .map((w) => JSON.parse(w.slice(6)))
  .filter((d) => d.type === "net");

const checks = {
  reAssertMiddlewarePresent: !!reassert,
  firstCallCaptured: net.some((e) => e.url.includes("/a")),
  captureSurvivesReplacement: net.some((e) => e.url.includes("/b")), // the actual fix
  exactlyTwoEvents: net.length === 2,
};
process.stdout.write("REPATCH CHECKS " + JSON.stringify(checks) + "\n");
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
