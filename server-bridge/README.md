# Server-log bridge (dev only)

The extension runs in the browser and **cannot see your SSR server's stdout** —
where loaders, your server logger, `LOADER … triggered` timing, and the
upstream API request/response dumps print. This **dev-only** Vite plugin
exposes that server console as a same-origin SSE stream; the extension's page
bridge consumes it and shows each line in the **Console** tab tagged `server`.

Built for **React Router v7 framework mode** (SSR runs in the Vite dev process,
so patching `console` here captures the loader / server output).

## How it works

```
loader / server console.log(...)     (Vite dev process — same one running SSR)
  → [plugin] tees each line to SSE at  <base>__rr-inspector/logs   (e.g. /shop/__rr-inspector/logs)
  → [extension page bridge] opens that stream (derives <base> from the router basename)
  → panel Console tab, tagged “server”
```

- `apply: "serve"` → **dev only**; production builds are untouched.
- **No app-code changes and no HTML injection** — RR framework mode doesn't run
  `transformIndexHtml` reliably, so the extension (not an injected page script)
  consumes the stream. You add exactly **one plugin line**.
- **Base-path aware / gateway-safe** — the endpoint is mounted under the app base
  (`/shop/…`), so it routes through your `:8080` gateway to the `:8082` dev
  server. `X-Accel-Buffering: no` keeps the stream unbuffered.
- **Preserves your terminal** — it wraps `console` to *also* forward, then calls
  the original, so nothing changes in your terminal output.

## Install (one line)

In the app's `vite.config.ts` (e.g. `apps/web/vite.config.ts`):

```ts
import rrInspector from "<path-to>/react-router-inspector/server-bridge/vite-plugin-rr-inspector.mjs";

export default defineConfig({
  plugins: [
    rrInspector(),   // dev-only; no-ops for builds. Put it before reactRouter().
    // ...existing plugins (reactRouterDevTools, reactRouter(), ...)
  ],
});
```

Restart the dev server, reload the app with the extension's **Console** tab open.
Repeat for each app you want to inspect — or add it to a shared
config if those extend one.

## Options

```ts
rrInspector({
  maxLine: 8000,          // cap per console line
  maxBody: 2_000_000,     // cap per request/response body (≈2 MB); Infinity to never truncate
  dropViteClientEcho: true, // skip browser logs Vite forwards to the terminal
  bufferMax: 300,         // recent events replayed to a panel when it connects
})
```

## Structured SSR calls (included)

Beyond forwarding server logs as text, the plugin also **intercepts global `fetch`**
(undici, the common Node HTTP client) and emits each call as a structured
`net` event: URL, method, request+response headers, status, **response body**, and
timing. The extension renders these as first-class **network rows** tagged `ssr` in
the left list — a real Network-tab view of your server-side calls, with the same
Headers / Payload / Response tabs.

- Non-destructive: reads the response via `res.clone()`, so your app still consumes
  its own body normally.
- Bodies are size-capped by `maxBody` (default ≈2 MB; set `Infinity` to never truncate).
- You'll see each SSR call **twice** — once as a text log line in Console (your
  server logger's own text output) and once as a structured `ssr` network row. Filter
  the Console by `server` or ignore the text dupes; the `ssr` rows are the clean view.
