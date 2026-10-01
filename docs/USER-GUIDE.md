# React Router Inspector — User Guide

A Chrome DevTools panel that shows what your React Router app is actually doing:
loader/action data, every network + SSR call, and server + browser console — all
decoded, in one place.

- [Install](#install)
- [The panel at a glance](#the-panel-at-a-glance)
- [Event types](#event-types)
- [The detail tabs](#the-detail-tabs)
- [The Console pane](#the-console-pane)
- [Toolbar](#toolbar)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Seeing server logs & SSR calls (the Vite plugin)](#server-side-the-vite-plugin)
- [Troubleshooting](#troubleshooting)

---

## Install

1. Unzip the extension somewhere permanent.
2. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → pick the folder.
3. Open any React Router app → **DevTools** (⌥⌘I) → the **React Router** tab.
   - The tab registers when DevTools *opens*; if it's missing, close and reopen DevTools.

Full first-run steps are in `INSTALL.md` (bundled in the zip).

---

## The panel at a glance

```
┌ Toolbar ─────────────────────────────────────────────────────────────┐
│ [RR] 🗑 ⬆ ⬇ │ ☑Preserve ☑Logs ▣Console │ ⚙ server: ok  live  [filter]│
├────────────────────────────┬──────────────────────────────────────────┤
│ [type chips: router data …]│ GET /overview · 200 · 42ms · 3.1kB    ⧉  │
│ EVENT LIST     status dur sz│ Loader · Routes · Payload · Headers ·     │
│ router · /overview  200 42ms│ Response · Raw          [ Find… ⌘F ]      │
│ data   · /overview  200 18ms│                                           │
│ gql    · GraphQL    200 …   │ (collapsible JSON tree of the selected    │
│ api    · /positions 200 …   │  event)                                   │
├────────────────────────────┴──────────────────────────────────────────┤
│ Console (toggleable bottom split pane)                          ✕      │
└────────────────────────────────────────────────────────────────────────┘
```

- **Left:** every event, newest at the bottom, with **status / duration / size**
  columns and type chips to filter by call kind. Click a row to inspect it.
- **Right:** a summary header + tabs for the selected event.
- **Bottom:** the Console pane, shown only when toggled on (see below).
- **Drag the divider** to resize; **double-click** it to reset.
- Rows with a 4xx/5xx status are highlighted red.

---

## Event types

Each row carries a colored tag:

| Tag | What it is |
|-----|------------|
| **router** | A live router snapshot — initial load or a settled navigation, read straight from the running router (`loaderData` / `actionData`). |
| **data** | A React Router `.data` request (single-fetch), turbo-stream decoded. |
| **gql** | A GraphQL operation — labeled by `operationName`, with variables + query parsed out. |
| **api** | A browser-side REST/XHR/fetch call. |
| **ssr** | A **server-side** fetch your loader made during SSR — captured via the dev plugin. The browser never issues these; this is the only place you can see them. |

---

A **summary header** above the tabs shows the selected event's method · route ·
status · duration · size, with a ⧉ to copy its URL.

- **Loader Data** — the decoded loader/action data for `router`/`data` events, as a
  collapsible tree. Real types survive: `Date(...)`, `Map(n)`, `BigInt` (`…n`),
  `undefined`. Collapsed objects preview as `key: value` pairs. When an earlier
  snapshot of the same route exists, a **Diff** toggle highlights what changed vs the
  previous navigation — added / changed / removed keys, inline, with a `+a ~c −r` count.
- **Routes** — the matched route hierarchy for a navigation (from the live bridge):
  each route's `id`, `pathname`, `params`, and its own `loaderData` slice.
- **Payload** — the request inputs, led by the **full URL** and method, then query
  params and any request body (GraphQL shows `operationName` + `variables`). Has
  **Copy JSON**, **Copy URL**, and **Copy as cURL**.
- **Headers** — request and response headers for network/SSR calls.
- **Response** — the decoded response body (JSON or turbo-stream). A capped body shows
  a red **⚠ truncated — cut off here** marker at the exact point the data ended.
- **Raw** — the untouched wire text, with **Pretty** (pretty-print JSON), **Wrap**
  (word-wrap), and **Copy** controls.

**Copy anything:** hover any tree row for a ⧉ that copies that value. **Find in pane**
(⌘F) searches the active tree, expanding + highlighting each hit (Enter / Shift+Enter
to step, Esc to clear). Long values wrap so you can read the whole thing.

---

## The Console pane

Console output lives in its own **split pane**, not a tab. Toggle **Console**
in the toolbar to open it; drag the divider to resize, and close it with the **✕**,
the toolbar toggle, or the **`c`** key. The toggle carries a live count badge, and the
open/closed state + size persist across reloads.

The pane **docks where it fits**: when DevTools is docked to the bottom (a wide,
short panel) the console appears as a **right-hand column**; when DevTools is
docked to the side (tall and narrow) it sits along the **bottom**. The **dock
button** in the console header cycles this: **Auto** (follows the panel shape, the
default) → pinned **Right** → pinned **Bottom**. Your choice — and each side's
size — persists.

One place for **browser and server** console output:

- **Grouped** — a logged object is **one collapsible entry**, not fragmented one
  line per row. Click the ▸ to expand.
- **Tagged** — `server` entries (from the dev plugin) get a green **SERVER** badge
  and are level-colored (ERROR/WARN/INFO/DEBUG/LOG).
- **Filter chips** — a bar of toggleable chips: **source** (`browser` / `server`,
  shown when both are present) and **level**, each with a live count. Click to
  hide/show. Combine with the toolbar text filter.

> **Console capture is a `console.*` wrap**, which inserts a frame into stack
> traces. Toggle it off with **Logs** in the toolbar when you want a pristine
> console; toggle on to capture (incl. SSR/hydration logs) — takes full effect on
> the next reload.

---

## Toolbar

| Control | Does |
|---------|------|
| 🗑 **Clear** | Empties the event list + console. |
| ⬆ **Export** | Saves the captured session to a JSON file (auth/cookie headers redacted) to share a repro. |
| ⬇ **Import** | Loads a previously exported session JSON. |
| **Preserve** | Keeps events across navigations (**on by default** — server logs/SSR calls happen *during* a navigation). |
| **Logs** | Toggles console capture (see above). |
| ▣ **Console** | Toggles the bottom console split pane; badge shows the captured count. |
| ⚙ **Server setup** | Opens the Vite-plugin setup card (download / copy the plugin). |
| **server: …** badge | Server bridge status (waiting / ok). |
| **mode** badge | Data source — `network decode` or `live router bridge`. |
| **Enable this site** | On a non-local origin, requests per-site access and reloads with the live bridge. |
| **filter** | Filters the list (and the Console) by route/URL/text, with a mini-syntax: `status:5xx` · `status:500` · `method:POST` · `kind:graphql` · `-word` to exclude. Plain words match route/URL. |

---

## Keyboard shortcuts

Focus the event list (or the panel) and:

| Key | Action |
|-----|--------|
| **↑ / ↓** or **j / k** | Move selection through the event list |
| **1**–**6** | Switch detail tab (Loader · Routes · Payload · Headers · Response · Raw) |
| **c** | Toggle the Console pane |
| **⌘K** / **Ctrl+K** | Jump to the toolbar filter |
| **⌘F** / **Ctrl+F** | Find in the active pane (Enter / Shift+Enter to step hits, Esc to clear) |

---

## Server-side: the Vite plugin

The extension can't see your Node server's stdout or its server-side `fetch` calls
(SSR runs before the browser exists). A **dev-only Vite plugin** streams them in.

### Get the plugin — from the panel

The plugin **ships inside the extension**. Click **⚙ Server setup** in the panel
toolbar → **Download plugin (.mjs)** (or **Copy plugin code**). Save it into your
project, e.g. `tools/vite-plugin-rr-inspector.mjs`.

### Add it to your `vite.config`

```ts
import rrInspector from './tools/vite-plugin-rr-inspector.mjs';

export default defineConfig({
  plugins: [ rrInspector(), reactRouter() ],  // rrInspector self-disables outside dev
});
```

Restart the dev server. `server`-tagged logs and `ssr` rows appear automatically —
no app-code changes, no HTML injection. (In a monorepo, drop it in a shared package
and import it from each app's config.)

### Options

```ts
rrInspector({
  maxLine: 8000,            // truncate long lines / response bodies
  dropViteClientEcho: true, // drop browser logs Vite forwards to the terminal
  bufferMax: 300,           // recent events replayed when the panel connects
})
```

### The plugin source

It's ~180 lines, zero-dependency (Node built-ins only). Full source:
[`server-bridge/vite-plugin-rr-inspector.mjs`](../server-bridge/vite-plugin-rr-inspector.mjs).
How it works is in [`docs/TECHNICAL.md`](TECHNICAL.md).

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| No **React Router** tab | DevTools was open before the extension loaded — close & reopen DevTools. |
| Panel empty on load | Framework mode SSRs the first page (no `.data` request). **Navigate** (change a filter) to see traffic, or rely on the bridge's initial-load event. |
| Panel says **network decode** on a deployed site | Click **Enable this site**, approve access to the exact origin, and let the panel reload the page. |
| No `server` logs / `ssr` rows | Check the server-status badge. For local development, confirm `rrInspector()` is in the Vite `plugins` array and restart the dev server. For a deployed app, the server must expose a compatible SSE bridge. Open `https://<host>/<base>/__rr-inspector/logs`; it should remain pending and start with `: router-inspector connected`. |
| Server logs vanish on navigation | Turn **Preserve** on (it's the default). |
| Console shows a count but no rows | You're on an old build — reload the extension. |
| `injected.js` in a stack trace | That's the console-capture passthrough, not an error. Toggle **Logs** off for pristine stacks. |
