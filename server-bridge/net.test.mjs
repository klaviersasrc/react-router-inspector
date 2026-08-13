// Verifies the server-side fetch interceptor emits a structured "net" event
// (method/url/status/headers/body/timing) and does NOT consume the app's response.
import rrInspector from "./vite-plugin-rr-inspector.mjs";

const realFetch = globalThis.fetch;
const routes = [];
const fakeServer = { middlewares: { use: (p, h) => routes.push({ path: p, handler: h }) } };

// Stub global fetch BEFORE the plugin patches it (mimics undici global fetch).
globalThis.fetch = async () =>
  new Response(JSON.stringify({ products: [{ bucket: "1-2yr", count: 7 }] }), {
    status: 200,
    headers: { "content-type": "application/json", server: "nginx/1.29.7" },
  });
globalThis.__rrFetchPatched = false;

const plugin = rrInspector();
plugin.configResolved({ base: "/shop/" });
plugin.configureServer(fakeServer); // patches globalThis.fetch + stdio

const written = [];
const fakeRes = { writeHead() {}, write: (s) => written.push(s), end() {} };
routes.find((r) => r.path === "/shop/__rr-inspector/logs").handler({ on() {} }, fakeRes);

const res = await globalThis.fetch(
  "https://api.example.com/catalog/summary?category=widgets",
  { method: "GET", headers: { "X-XSRF-TOKEN": "abc" } }
);
const appBody = await res.text(); // the app must still be able to read the body

globalThis.fetch = realFetch;
delete globalThis.__rrFetchPatched;

const events = written.filter((w) => w.startsWith("data: ")).map((w) => JSON.parse(w.slice(6)));
const net = events.find((d) => d.type === "net");

const checks = {
  emittedNetEvent: !!net,
  method: net?.method === "GET",
  urlCaptured: !!net && net.url.includes("catalog/summary"),
  status200: net?.status === 200,
  requestHeaderCaptured: net?.reqHeaders?.["X-XSRF-TOKEN"] === "abc",
  responseHeaderCaptured: /json/.test(net?.resHeaders?.["content-type"] || ""),
  responseBodyCaptured: !!net?.resBody && net.resBody.includes("products"),
  timingCaptured: typeof net?.durationMs === "number",
  appStillReadsBody: appBody.includes("products"), // clone didn't consume original
};
process.stdout.write("NET CHECKS " + JSON.stringify(checks) + "\n");
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
