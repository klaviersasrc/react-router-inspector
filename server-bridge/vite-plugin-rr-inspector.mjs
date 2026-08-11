// Dev-only Vite plugin: expose the SSR/server terminal output + server-side fetch
// calls to the React Router Inspector extension.
//
// The extension runs in the browser and cannot see your Node server's stdout
// (loaders, the fusion/core httpClient logger, LOADER timing, etc.) or its
// server-side fetch calls. This plugin (1) tees process.stdout/stderr — capturing
// the terminal stream verbatim, whether lines come from console.* or a logger
// writing straight to stdout — and (2) intercepts global fetch (undici) to emit
// each server request/response as a structured "net" event. Both are streamed
// over SSE at `<base>__rr-inspector/logs`; the extension's page bridge opens that
// stream and renders logs in the Console tab and fetches as network rows.
//
// Built for React Router v7 framework mode (SSR runs in the Vite dev process).
// - apply:"serve"  -> dev only; never affects production builds.
// - No app-code changes, no HTML injection (RR fw mode doesn't run transformIndexHtml).
// - Base-path aware / gateway-safe; preserves your terminal output.
//
// Usage (dev only) in vite.config.ts:  plugins: [ rrInspector(), reactRouter() ]
// Options: { maxLine?: number, dropViteClientEcho?: boolean, bufferMax?: number }

const SUFFIX = "__rr-inspector/logs";
const ANSI = new RegExp(String.fromCodePoint(27) + String.raw`\[[0-9;]*[A-Za-z]`, "g"); // strip ANSI colours

function frame(obj) {
  return "data: " + JSON.stringify(obj) + "\n\n";
}

function levelOf(line, def) {
  if (/\bERROR\b/i.test(line)) return "error";
  if (/\bWARN(ING)?\b/i.test(line)) return "warn";
  if (/\bDEBUG\b/.test(line)) return "debug";
  if (/\bINFO\b/.test(line)) return "info";
  return def;
}

function chunkToString(chunk) {
  if (typeof chunk === "string") return chunk;
  if (Buffer.isBuffer(chunk)) return chunk.toString("utf8");
  return "";
}

function truncate(s, n) {
  if (typeof s !== "string") return s;
  return s.length > n ? s.slice(0, n) + " …[truncated]" : s;
}

function headersToObj(h) {
  if (!h) return null;
  const o = {};
  try {
    if (typeof h.forEach === "function" && !Array.isArray(h)) {
      h.forEach((v, k) => { o[k] = v; }); // Headers
    } else if (Array.isArray(h)) {
      for (const [k, v] of h) o[k] = v;
    } else {
      for (const k of Object.keys(h)) o[k] = h[k];
    }
  } catch { /* best-effort: header shapes vary */ }
  return Object.keys(o).length ? o : null;
}

function errText(err) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try { return JSON.stringify(err); } catch { return "unknown error"; }
}

export default function rrInspectorServerLogs(options = {}) {
  const maxLine = options.maxLine ?? 8000;
  const dropViteClientEcho = options.dropViteClientEcho ?? true; // skip browser logs Vite forwards to the terminal
  const bufferMax = options.bufferMax ?? 300; // replayed to a panel when it connects
  const clients = new Set();
  const buffer = []; // recent events, so a late-connecting panel still sees initial-load logs
  let base = "/";
  let patched = false;

  function broadcast(obj) {
    buffer.push(obj);
    if (buffer.length > bufferMax) buffer.shift();
    const line = frame(obj);
    for (const res of clients) {
      try { res.write(line); } catch { /* client gone */ }
    }
  }

  // One console.log(...) = one write() of a (possibly multi-line) formatted string.
  // Emit the whole write as ONE entry so objects stay together; the panel renders
  // multi-line entries collapsibly.
  function emitEntry(raw, defaultLevel) {
    let text = raw.replace(ANSI, "").replace(/\n$/, "");
    if (!text.trim()) return;
    const firstLine = text.split("\n", 1)[0];
    if (dropViteClientEcho && firstLine.includes("[vite] (client)")) return; // captured browser-side already
    if (text.length > maxLine) text = text.slice(0, maxLine) + " …[truncated]";
    broadcast({ type: "console", source: "server", level: levelOf(firstLine, defaultLevel), text, time: new Date().toISOString() });
  }

  function tee(original, defaultLevel) {
    let buf = "";
    return function (...args) {
      try {
        const s = chunkToString(args[0]);
        if (s) {
          buf += s;
          // Flush on newline (entry complete) or when a partial line runs away.
          if (buf.endsWith("\n") || buf.length > maxLine * 4) {
            emitEntry(buf, defaultLevel);
            buf = "";
          }
        }
      } catch { /* best-effort: never break the real write */ }
      return original.apply(this, args);
    };
  }

  function patchStdio() {
    if (patched) return;
    patched = true;
    process.stdout.write = tee(process.stdout.write.bind(process.stdout), "log");
    process.stderr.write = tee(process.stderr.write.bind(process.stderr), "error");
  }

  // Intercept global fetch (undici) — the fusion/core httpClient — and emit each
  // request/response as a structured "net" event (URL, method, headers, status,
  // timing, body). Non-destructive: reads the body via res.clone().
  function patchFetch() {
    const g = globalThis;
    if (typeof g.fetch !== "function" || g.__rrFetchPatched) return;
    g.__rrFetchPatched = true;
    const orig = g.fetch;
    g.fetch = async function (...args) {
      const input = args[0];
      const init = args[1];
      const reqObj = typeof input === "object" && input !== null ? input : null;
      const start = Date.now();
      const method = init?.method || reqObj?.method || "GET";
      const url = typeof input === "string" ? input : (reqObj?.url ?? "");
      const reqHeaders = headersToObj(init?.headers ?? reqObj?.headers);
      let reqBody = null;
      try {
        const b = init?.body;
        if (typeof b === "string") reqBody = truncate(b, 8000);
      } catch { /* best-effort */ }
      try {
        const res = await orig.apply(this, args);
        try {
          let resBody = null;
          try { resBody = truncate(await res.clone().text(), 20000); } catch { /* body unreadable */ }
          broadcast({
            type: "net", source: "server", method, url: res.url || url,
            status: res.status, ok: res.ok,
            reqHeaders, resHeaders: headersToObj(res.headers), reqBody, resBody,
            durationMs: Date.now() - start, time: new Date().toISOString(),
          });
        } catch { /* best-effort */ }
        return res;
      } catch (err) {
        broadcast({
          type: "net", source: "server", method, url, status: 0, ok: false,
          reqHeaders, reqBody, error: errText(err),
          durationMs: Date.now() - start, time: new Date().toISOString(),
        });
        throw err;
      }
    };
  }

  return {
    name: "rr-inspector-server-logs",
    apply: "serve",

    configResolved(cfg) {
      base = cfg.base || "/";
      if (!base.endsWith("/")) base += "/";
    },

    configureServer(server) {
      const handler = (req, res) => {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });
        res.write(": rr-inspector connected\n\n");
        for (const obj of buffer) {
          try { res.write(frame(obj)); } catch { /* client gone */ }
        }
        clients.add(res);
        req.on("close", () => clients.delete(res));
      };
      for (const p of new Set([base + SUFFIX, "/" + SUFFIX])) {
        server.middlewares.use(p, handler);
      }
      patchStdio();
      patchFetch();
    },
  };
}
