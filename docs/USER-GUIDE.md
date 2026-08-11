# React Router Inspector — User Guide

A Chrome DevTools panel that shows what your React Router app is actually doing:
loader/action data, every network + SSR call, and server + browser console — all
decoded, in one place.

- [Install](#install)
- [The panel at a glance](#the-panel-at-a-glance)
- [Event types](#event-types)
- [The detail tabs](#the-detail-tabs)
- [The Console tab](#the-console-tab)
- [Toolbar](#toolbar)
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
│ [RR] Clear  ☑Preserve  ☑Logs   (live router bridge)   [ filter … ]    │
├────────────────────────────┬──────────────────────────────────────────┤
│ EVENT LIST                 │ DETAIL                                    │
│ router · GET /overview     │ Loader Data · Payload · Headers ·         │
│ data   · GET …/overview.data│ Response · Raw · Console                  │
│ gql    · POST GraphQL       │                                           │
│ api    · GET /positions/…   │ (collapsible JSON tree of the selected    │
│ ssr    · GET …/byCsr        │  event)                                   │
└────────────────────────────┴──────────────────────────────────────────┘
```

- **Left:** every event, newest at the bottom. Click one to inspect it.
- **Right:** tabs for the selected event.
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

## The detail tabs

- **Loader Data** — the decoded loader/action data for `router`/`data` events, as a
  collapsible tree. Real types survive: `Date(...)`, `Map(n)`, `BigInt` (`…n`),
  `undefined`, nested arrays/objects.
- **Payload** — the request inputs, led by the **full URL** and method, then query
  params and any request body (GraphQL operations show `operationName` + `variables`).
- **Headers** — request and response headers for network/SSR calls.
- **Response** — the decoded response body (JSON or turbo-stream).
- **Raw** — the untouched wire text (for `data` events, the raw turbo-stream).
- **Console** — see below.

Long values (URLs, tokens) wrap so you can read the whole thing.

---

## The Console tab

One place for **browser and server** console output.

- **Grouped** — a logged object is **one collapsible entry**, not fragmented one
  line per row. Click the ▸ to expand.
- **Tagged** — `server` entries (from the dev plugin) get a green **SERVER** badge
  and are level-colored (ERROR/WARN/INFO/DEBUG/LOG).
- **Filter chips** — a bar of toggleable chips: **source** (`browser` / `server`,
  shown when both are present) and **level**, each with a live count. Click to
  hide/show. Combine with the toolbar text filter.
- The tab badge shows the captured count.

> **Console capture is a `console.*` wrap**, which inserts a frame into stack
> traces. Toggle it off with **Logs** in the toolbar when you want a pristine
> console; toggle on to capture (incl. SSR/hydration logs) — takes full effect on
> the next reload.

---

## Toolbar

| Control | Does |
|---------|------|
| **Clear** | Empties the event list + console. |
| **Preserve** | Keeps events across navigations (**on by default** — server logs/SSR calls happen *during* a navigation). |
| **Logs** | Toggles console capture (see above). |
| **live router bridge** badge | Green when the page bridge is connected to the running router. |
| **filter** | Filters the list (and the Console) by route/URL/text. |

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
| No `server` logs / `ssr` rows | The Vite plugin isn't running: confirm `rrInspector()` is in the `plugins` array (not just imported) and **restart** the dev server. Test the stream directly: open `https://<host>/<base>/__rr-inspector/logs` — it should hang on `: rr-inspector connected`. |
| Server logs vanish on navigation | Turn **Preserve** on (it's the default). |
| Console shows a count but no rows | You're on an old build — reload the extension. |
| `injected.js` in a stack trace | That's the console-capture passthrough, not an error. Toggle **Logs** off for pristine stacks. |
