# React Router Inspector

[![Latest release](https://img.shields.io/badge/release-v1.0.11-4ec9b0?style=flat-square)](https://github.com/klaviersasrc/react-router-inspector/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-3b82f6?style=flat-square)](LICENSE)
[![Chrome](https://img.shields.io/badge/Chrome-MV3%20DevTools-6b7280?style=flat-square)](manifest.json)

A Chrome DevTools extension that shows React Router's data flow the way the Network
tab shows request payload + response body: **per route, decoded, readable**. Built to
replace the in-app `react-router-devtools` panel for inspection work.

## What it does

Adds a **React Router** panel to Chrome DevTools that unifies three data sources —
the live router bridge, DevTools network capture, and an optional dev server bridge —
into one view, **with no changes to your app required**.

- **Every event, per route** — router navigations, `.data` single-fetch requests
  (turbo-stream decoded), GraphQL + REST/XHR calls, and **server-side SSR fetches** —
  each tagged and category-colored, with status / duration / size columns.
- **Detail tabs** — **Loader Data**, **Routes** (the matched route hierarchy, each
  route's params + its own loaderData), **Payload**, **Headers**, **Response**, and
  **Raw** (Pretty + word-wrap toggles). Real types survive: `Date`, `Map`, `BigInt`,
  `undefined`. Collapsed objects preview as `key: value` pairs.
- **Loader-data diff** — what changed in `loaderData` vs the previous navigation to
  the same route (added / changed / removed keys highlighted inline).
- **Copy anything** — hover-copy any tree node, Copy JSON per pane, **Copy as cURL**
  for any request.
- **Find in pane** (⌘F), **keyboard nav** (↑/↓ or j/k, `1`–`6` tabs, ⌘K filter, `c`
  console), and a **filter mini-syntax**: `status:5xx`, `method:POST`, `kind:graphql`,
  `-exclude`.
- **Group by navigation**, an **Errors** filter chip, and a **detail summary header**.
- **Console** as a toggleable, drag-resizable bottom split pane — browser + server
  logs, source/level filter chips, collapsible objects.
- **Export / import** a captured session as JSON (auth/cookie headers redacted) to
  share a repro; capped bodies show a marker at the exact truncation point.
- **Per-site access** — works on localhost out of the box; enable any deployed origin
  on demand (broad host access is optional, approved per-origin at runtime).

Preferences (filters, active tab, console/panel state, toggles) persist across
reloads. Data source is shown by a badge: `network decode` (from captured `.data`
traffic — any RR app, incl. prod) or `live router bridge` (straight from the running
router — the fullest data).

## Load it (unpacked)

1. Chrome → `chrome://extensions`
2. Toggle **Developer mode** (top right).
3. **Load unpacked** → select this `rr-inspector/` folder.
4. Open DevTools on your RR app → **React Router** tab.
5. On a non-local site, click **Enable this site** and approve access to that exact
   origin. The panel reloads the page with the live bridge enabled.
6. Navigate / submit a form in the app; events stream into the panel.

Reload the extension after any file edit (the ⟳ on its card), then re-open DevTools.

## Files

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest; devtools page + bridge content scripts + relay worker |
| `devtools.html` / `src/devtools.js` | registers the DevTools panel |
| `panel.html` / `panel.css` / `src/panel.js` | the panel UI + network capture + rendering |
| `src/site-access.js` | optional per-origin permission + dynamic bridge registration |
| `src/turbo-init.mjs` + `src/vendor/turbo-stream.mjs` | vendored single-fetch (`.data`) decoder (MIT, pinned to RR's 2.4.1) |
| `src/json-tree.js` | collapsible JSON tree renderer (copy, diff marks, kv previews) |
| `src/injected.js` | MAIN-world page bridge (live router + fetch capture + SSE consumer) |
| `src/content.js` | ISOLATED relay: page ↔ extension |
| `src/background.js` | routes bridge messages to the right panel |
| `src/curl.js` · `diff.js` · `routes-view.js` · `session-io.js` · `filter.js` · `group.js` · `partial-json.js` | pure, unit-tested helpers (Copy-as-cURL, loader diff, routes view, export/import, filter syntax, group-by-nav, truncated-JSON repair) |

## Team distribution

Build a versioned, runtime-only zip for teammates:

```bash
./scripts/package.sh        # -> dist/react-router-inspector-v<version>.zip
```

The zip contains only the files Chrome loads (no `demo/`, `test/`, `server-bridge/`,
or docs) plus an `INSTALL.md`. Share the zip; teammates unzip it and **Load unpacked**
(see `INSTALL.md`). Bump `version` in `manifest.json` for each release. For one-click
installs later, the same zip can be uploaded to the Chrome Web Store as an **unlisted**
item, or hosted internally as a `.crx` with an update manifest for policy force-install.

The bundled Vite plugin feeds server logs / SSR calls during local development.
A deployed application can provide the same same-origin SSE protocol at
`<app-base>/__rr-inspector/logs`; enabling extension site access alone cannot make
server stdout available.

## Background

See `SPIKE.md` for the original feasibility findings and the architecture decision
(network decode vs. live router bridge vs. server bridge).
