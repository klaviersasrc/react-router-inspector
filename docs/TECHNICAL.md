# Technical Description

How React Router Inspector is built, how data reaches the panel, and the design
decisions behind it.

## Overview

The tool is a **Chrome DevTools extension** (Manifest V3) plus an optional server
bridge. It pulls from three data sources and unifies them in one panel:

1. **Live router bridge** — reads the running router's state directly.
2. **DevTools network capture** — decodes the browser's `.data` / API traffic.
3. **Server bridge** — the bundled Vite plugin handles local development; a
   deployed app can implement the same SSE protocol to stream SSR/server logs and
   server-side `fetch` calls the browser can't see.

There is no remote extension code (the turbo-stream decoder is vendored), no
third-party telemetry, and no data collection. Deployed server events travel only
from the inspected same-origin application to the local extension panel.

## Components

```
manifest.json            MV3: devtools_page + content scripts (ISOLATED + MAIN) + service worker
devtools.html/js         registers the "React Router" panel
panel.html/css/js        the panel UI, DevTools network capture, rendering, split panes
src/turbo-init.mjs       exposes the vendored turbo-stream decoder (external — CSP forbids inline)
src/vendor/turbo-stream  the single-fetch decoder (MIT, pinned to RR's 2.4.1)
src/json-tree.js         collapsible tree renderer (Dates/Maps/BigInt/undefined aware; copy + diff marks)
src/site-access.js       optional per-origin permission + dynamic script registration
src/injected.js          MAIN-world page bridge: router subscribe + fetch capture + console + SSE consumer
src/content.js           ISOLATED relay: page <-> extension (both directions)
src/background.js        service worker: routes messages between panels and tabs
server-bridge/…          the dev-only Vite plugin

pure, unit-tested helper modules (each exposes a window.rr* fn, no DOM/globals):
src/curl.js              Copy-as-cURL — request → shell-safe curl string
src/diff.js              loader-data diff — added/changed/removed keys vs previous nav
src/routes-view.js       Routes tab — matched-route hierarchy view model
src/session-io.js        export/import — session (de)serialization + header redaction
src/filter.js            filter mini-syntax parser (status:/method:/kind:/-exclude)
src/group.js             group-by-navigation bucketing
src/partial-json.js      truncated-JSON repair: inject RR_TRUNCATED sentinel at the cut point
```

## Data flow

**Live router bridge (primary for loader/action data).**
```
injected.js (MAIN world) finds the data router (window.__reactRouterDataRouter,
or any object with .subscribe() + .state.loaderData) → subscribe() → on each
settled navigation, sanitize the state (drop fns/promises, keep Date/Map/Set) →
postMessage → content.js → background → panel
```
Reading the router directly means **no decoding** — the values are already live JS
objects, so Dates/Maps/BigInts render as-is.

**DevTools network capture (for `.data` and browser API calls).**
```
chrome.devtools.network.onRequestFinished → filter xhr/fetch (+ RR .data) →
req.getContent() → JSON, or turbo-stream decode for .data → panel row
```
GraphQL calls are parsed into `operationName` + `variables`.

**Server bridge (for SSR — see below).**

## turbo-stream decoding

RR v7 framework mode encodes single-fetch (`.data`) responses with **turbo-stream**
— a reference-flattened, newline-delimited format that carries `Date`, `Map`,
`Set`, `BigInt`, `Promise`, etc. (JSON can't). We vendor the upstream `turbo-stream`
decoder and wrap it:

```js
const { value, done } = await decode(new Response(text).body);
await done; // resolve deferred/streamed chunks
```

Because MV3 extension pages forbid inline scripts (`script-src 'self'`), the decoder
is loaded from an **external** module (`src/turbo-init.mjs`), not inline.

## The server bridge (Vite plugin)

The browser can't see the Node server's stdout or its server-side `fetch` calls
(SSR runs before the browser exists). The plugin (`apply: "serve"`, dev only):

- **Tees `process.stdout` / `process.stderr`** — captures the entire terminal
  stream verbatim, so it works even when a logger writes straight to a file
  descriptor and bypasses `console.*`. Lines are grouped per write (one
  `console.log(obj)` = one entry), ANSI-stripped, level-sniffed.
- **Intercepts global `fetch` (undici)** — emits each server request/response as a
  structured `net` event (URL, method, headers, status, body, timing). Reads the
  body via `res.clone()` so the app's own consumption is untouched.
- **Streams both over same-origin SSE** at `<base>__rr-inspector/logs`, mounted
  under the app base so a gateway/proxy routes it. Recent events are buffered and
  replayed to a newly-connected panel (so a plain reload shows initial-load calls).

The extension's page bridge opens that SSE stream (deriving the base from the
router basename) and forwards events to the panel; the panel dedupes replays.

## Message-passing topology (Redux-DevTools style)

```
panel  <—chrome.runtime port—>  background(service worker)  <—chrome.tabs—>  content.js (ISOLATED)  <—window.postMessage—>  injected.js (MAIN)
```

- The **panel** can't touch the page; the **content script** can't see page globals.
  So the **injected MAIN-world script** reads `window.__reactRouter*` and patches
  `fetch`/`console`, and relays via `postMessage`.
- The downward channel (panel → page) carries controls like the console-capture
  toggle.

## Per-site access

Static content scripts cover localhost without an extra prompt. On any other
HTTP(S) origin, the panel requests only that exact origin through
`optional_host_permissions`, then uses `chrome.scripting.registerContentScripts`
to persist the ISOLATED and MAIN-world bridges for that origin. DevTools network
capture remains available before site access is granted.

## Store-hardened manifest

For a Web Store submission:
- Required `host_permissions` remain limited to localhost.
- Broad HTTP(S) patterns are optional. The user explicitly approves the exact
  deployed origin from the DevTools panel before dynamic scripts are registered.
- The `scripting` permission is used only for those user-approved registrations.
- No other changes required — there's no remote code or data collection to declare.

## Rendering & UI structure

The panel is a single `panel.js` controller over a `panes` map (loader / routes /
payload / headers / response / raw, plus the console body). The detail tree is
rendered by `json-tree.js`, which threads diff marks and JSON paths through each
node, previews collapsed objects as `key: value` pairs within a char budget, adds a
hover-copy control per row, and renders the `RR_TRUNCATED` sentinel as a visible
truncation marker. The console is a **bottom split pane** (`#consolePane`) with a
drag resizer; its open state and height persist via the same `pref*` helpers that
persist filters, the active tab, and toggles.

Logic that can be tested without a browser is factored into the pure `window.rr*`
helper modules above. Each is unit-tested in Node by evaluating the file with
`new Function(readFileSync(...))()` against minimal DOM stubs — no bundler, no
headless browser.

## Testing

Ten test files, all green:

- `test/decode.test.mjs` — turbo-stream round-trip incl. Date/Map/BigInt/undefined.
- `test/site-access.test.mjs` — exact-origin matching and dynamic registration.
- `test/curl.test.mjs` — request → shell-safe cURL.
- `test/diff.test.mjs` — loader-data diff (added/changed/removed).
- `test/routes-view.test.mjs` — matched-route hierarchy view model.
- `test/session-io.test.mjs` — session export/import + header redaction.
- `test/filter.test.mjs` — filter mini-syntax parsing + matching.
- `test/group.test.mjs` — group-by-navigation bucketing.
- `test/json-tree.test.mjs` — tree rendering, previews, copy, truncation marker.
- `test/partial-json.test.mjs` — truncated-JSON sentinel placement.
- `server-bridge/plugin.test.mjs` — stdout tee: logger-bypass capture, multi-line
  grouping, ANSI strip, echo-drop.
- `server-bridge/net.test.mjs` — fetch interceptor: structured event, non-destructive
  body read.
- `demo/` — a static, generic mock of the panel for visual checks (no real data).
