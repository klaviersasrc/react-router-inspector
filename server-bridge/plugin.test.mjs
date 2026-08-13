// Verifies the plugin tees process.stdout/stderr (so it captures loggers that
// write straight to stdout, bypassing console.*), strips ANSI, tags levels, and
// drops Vite's forwarded browser echoes — without needing a real Vite server.
import rrInspector from "./vite-plugin-rr-inspector.mjs";

const origOut = process.stdout.write.bind(process.stdout);
const origErr = process.stderr.write.bind(process.stderr);

const routes = [];
const fakeServer = { middlewares: { use: (p, h) => routes.push({ path: p, handler: h }) } };
const plugin = rrInspector();
plugin.configResolved({ base: "/shop/" });
plugin.configureServer(fakeServer); // patches process.stdout/stderr

const written = [];
const fakeRes = { writeHead() {}, write: (s) => written.push(s), end() {} };
routes.find((r) => r.path === "/shop/__rr-inspector/logs").handler({ on() {} }, fakeRes);

// Simulate a server logger writing straight to stdout (NOT via console.*):
process.stdout.write(
  "2026-08-10 12:00:13,727 DEBUG [http] HTTP Request: https://api.example.com/catalog/summary?category=widgets\n"
);
process.stdout.write("LOADER routes/overview triggered - 1159.43ms\n");
process.stderr.write("\x1B[31mERROR upstream failed\x1B[0m\n"); // ANSI + stderr
process.stdout.write("12:00:14 PM [vite] (client) [console.warn] browser echo\n"); // should be dropped
// A single multi-line write (one console.log(obj)) must become ONE entry, not many:
process.stdout.write("params {\n  method: 'GET',\n  url: 'http://x?category=widgets'\n}\n");

// Restore BEFORE asserting so our own output isn't captured.
process.stdout.write = origOut;
process.stderr.write = origErr;

const events = written.filter((w) => w.startsWith("data: ")).map((w) => JSON.parse(w.slice(6)));
const gotHttp = events.find((d) => d.source === "server" && d.level === "debug" && d.text.includes("catalog/summary"));
const gotLoader = events.find((d) => d.text.includes("LOADER routes/overview triggered"));
const gotErr = events.find((d) => d.level === "error" && d.text.includes("upstream failed") && !d.text.includes("\x1B"));
const droppedEcho = !events.some((d) => d.text.includes("[vite] (client)"));
const paramsEntries = events.filter((d) => d.text.startsWith("params {"));
const groupedMultiline = paramsEntries.length === 1 && paramsEntries[0].text.includes("method: 'GET'") && paramsEntries[0].text.includes("url:");

const checks = {
  capturesLoggerStdout: !!gotHttp, // the whole point: logger bypasses console, we still get it
  capturesLoaderTiming: !!gotLoader,
  stderrAsError_ansiStripped: !!gotErr,
  dropsViteClientEcho: droppedEcho,
  groupsMultilineIntoOneEntry: groupedMultiline,
  endpointUnderBase: routes.some((r) => r.path === "/shop/__rr-inspector/logs"),
  applyServeOnly: plugin.apply === "serve",
};
process.stdout.write("CHECKS " + JSON.stringify(checks) + "\n");
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
