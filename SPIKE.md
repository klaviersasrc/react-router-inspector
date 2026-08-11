# SPIKE — Chrome DevTools inspector for React Router data flow

**Question:** Can we get Next.js / Network-tab-quality inspection of React Router's
loader & action data — the request payload and the decoded response body, per route —
instead of the in-app `react-router-devtools` overlay (the panel in the screenshot)?

**Answer: yes, and it's very tractable.** A pure external Chrome DevTools extension is
the right shape. The one genuinely hard-sounding part — decoding React Router v7's
"single fetch" wire format — turns out to be a single library call. Working POC in this
folder; verified in-browser.

---

## 1. What the current tool is, and why it grates

`react-router-devtools` (Alem Tuzlak / forge42, formerly `remix-development-tools`) is a
**Vite plugin that injects an in-app React overlay**. It reads router state from *inside*
your app via RR hooks/context and patches `fetch` to fill a "Network"/"Timeline" tab.

Why it's poor for payload/response inspection specifically:

- **In-app, in-render.** Shares your app's React tree and render cycle; the floating
  overlay sits over the real UI; it's dev-bundle weight wired through the Vite plugin.
- **Reconstructed, not authoritative.** Its "network" view is re-derived from a patched
  `fetch` + router state — *not* the browser's real request/response records — so you
  never get the raw request payload + raw response body the way DevTools' Network tab
  shows them.
- **Oriented at "what does my router think right now,"** not "here is the exact `.data`
  request/response for this route, decoded." That gap is exactly the target.

Nobody has shipped an *external, network-decoding* DevTools extension for RR — the niche
is open.

## 2. How RR v7 framework mode moves data (the facts that shape the design)

- **Client navigations/fetches** hit the same path with `.data` appended:
  `GET /shop/products.data?page=0&showAdvanced=true`. Your loader's URL search
  params ride along verbatim — so request payload for loaders is just the query string.
- **Actions** are `POST …/invoice.data`; the body is the action payload, and the response
  also carries the revalidated loader data for the ensuing reload.
- **One `.data` request fans out to multiple loaders.** The decoded body is an object
  **keyed by route id** (`root`, `routes/invoice`, …), each entry `{ data }` or `{ error }`.
- **`_routes=` is conditional** — present only for granular revalidation
  (`?_routes=root,routes/invoice`); absent means all matched loaders ran.
- **Encoding is turbo-stream, not JSON.** RR v7 pins `turbo-stream@2.4.1` (upstreamed into
  the RR repo with "one very minor change"). It streams types JSON can't carry — `Date`,
  `Map`, `Set`, `BigInt`, `Error`, `Promise`, `RegExp`, `URL`. This is why mocking a
  `.data` response with plain JSON fails with *"Unable to decode turbo-stream response."*
- **The initial page load's loader data is NOT a `.data` request.** It's SSR'd and streamed
  inline into `window.__reactRouterContext`. A pure network sniffer therefore only sees
  data from the *second* navigation onward — a real gap we have to close deliberately.

## 3. The key decision: decode the network, don't chase the live router

| | (a) Pure external, decode `.data` network | (b) Read the live router instance |
|---|---|---|
| Decode difficulty | **Low** — `turbo-stream` `decode(stream)`, one call | n/a (data already structured) |
| Router access w/o app changes | n/a | **Hard** — router is **not** on `window` in v7 framework mode; needs fragile React-fiber walking (the very thing that makes existing tools brittle) |
| Initial page load | No by itself → close via `__reactRouterContext.state` | Yes |
| Subsequent nav/actions | **Yes, reliably** (DevTools Network API) | Only while holding a live router handle |
| App changes | **None** | None required, but couples to React internals |

**Chosen architecture:** (a) as the spine — DevTools Network API + `turbo-stream` decode,
presented per route id — **plus** a tiny MAIN-world page-script that reads
`window.__reactRouterContext.state` once to recover the first-load data, and monkeypatches
`fetch` to capture `.data` bodies in-page (reliable raw text; room to tee streamed/deferred
responses later). No app changes; no dependence on grabbing the router. This is the
**Redux DevTools topology** (external extension + injected page-script ↔ panel over
`window.postMessage`, relayed through content/background), not the React-DevTools fiber walk.

## 4. What's built (POC in this folder) & how it was verified

- MV3 extension: **React Router** DevTools panel, network capture of `.data`, per-event
  tabs **Loader Data / Payload / Response / Raw**, decoded route-keyed tree.
- Optional self-injecting page bridge: initial hydration state + in-page `fetch` capture.
- Real `turbo-stream@2.4.1` decoder vendored (`src/vendor/turbo-stream.mjs`, MIT).

**Verified (not asserted):**
1. **Decoder round-trip in Node** (`test/decode.test.mjs`): encode a realistic route-keyed
   single-fetch body → serialize to the exact string `getContent()` returns → decode via
   the panel's wrapper. `Date`, `Map`, `BigInt`, `undefined`, nested arrays all survive. ✅
2. **In-browser render** (`demo/`): the panel decodes turbo-stream *in the browser* and
   renders it through the real `json-tree.js` + `panel.css` — loader data shows
   `Date(2026-08-10…)`, `Map(2)`, `90071992547409910n`, `undefined`; the action event's
   Payload tab shows the decoded request body. Zero console errors. ✅

What is **not** yet proven (needs the real app, one-liners): the exact `window.__reactRouter*`
global names/shape, and a real decoded `.data` body's edge keys (action/redirect symbols).

## 5. Gotchas that will matter in a production build

- **Network listener activation:** `chrome.devtools.network.onRequestFinished` only fires
  after DevTools' Network panel has engaged; requests before the listener attaches are
  missed. Prompt "reload with the panel open." (The page bridge sidesteps this for `.data`.)
- **`getContent()` returns the fully buffered body** as a string, and is async. For loaders
  that stream deferred promises over time you get the final concatenated body — fine for a
  final view; live progressive resolution needs the in-page `fetch` tee.
- **Isolated vs MAIN world:** content scripts can't see page `window` globals; the bridge
  must run in the MAIN world (`"world": "MAIN"`) to read `__reactRouterContext` and the real
  `fetch`.
- **turbo-stream was upstreamed with a "minor change"** — validate the vendored decoder
  against a real captured `.data` response before shipping (byte-compat is very likely, not
  guaranteed).

## 6. Production roadmap (rough effort past this POC)

- **P1 — Solidify the two data paths (~2–3 d):** confirm globals + real `.data` shape on the
  target app; robust route-id → path mapping via `__reactRouterManifest`; timing/status
  columns; error-entry rendering; de-dupe network vs. bridge for the same request.
- **P2 — Inspection polish (~2–3 d):** search/filter, copy-as-JSON / copy raw, diff a route's
  loader data across navigations, deferred/streamed value handling (tee + progressive),
  request/response headers, jump-to-route-module.
- **P3 — Detection & modes (~1–2 d):** auto-detect framework vs. SPA data mode
  (`__staticRouterHydrationData`) vs. legacy Remix (`_data`, JSON); graceful "not a RR app."
- **P4 — Package (~1–2 d):** icons, options page (bridge on/off), Web Store listing or
  internal distribution.

**Net:** a genuinely useful internal tool is ~1 week past this POC; the risky unknown
(decoding) is already retired.

## 7. Recommendation

Proceed on architecture (a)+bridge. Immediate next step is a 30-minute validation on the
actual `your app` app: load the unpacked extension, capture one real navigation and
one action, and confirm the decoded shape + global names. Everything else is polish on a
proven core.
