# React Router Inspector

[![Latest release](https://img.shields.io/badge/release-v1.0.6-4ec9b0?style=flat-square)](https://github.com/klaviersasrc/react-router-inspector/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-3b82f6?style=flat-square)](LICENSE)
[![Chrome](https://img.shields.io/badge/Chrome-MV3%20DevTools-6b7280?style=flat-square)](manifest.json)

A Chrome DevTools extension that shows React Router's data flow the way the Network
tab shows request payload + response body: **per route, decoded, readable**. Built to
replace the in-app `react-router-devtools` panel for inspection work.

## What it does (POC scope)

- Adds a **React Router** panel to Chrome DevTools.
- Captures the single-fetch `.data` requests (loaders = GET, actions = POST) from the
  DevTools network feed — **no changes to your app required**.
- Splits each event into tabs: **Loader Data** (decoded), **Payload** (query params +
  form body), **Response** (decoded body), **Raw** (untouched wire text).
- Optional **page bridge** (MAIN-world script) that reads the live router state
  (`loaderData` / `actionData`) directly for the richest view — no app import needed,
  it self-injects on localhost and can be enabled per deployed origin.

Two data sources, shown by the badge in the toolbar:
- `network decode` — decoded from captured `.data` traffic (works on prod, any RR app).
- `live router bridge` — read straight from the running router (fullest data).

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
| `src/turbo-stream-decode.js` | decodes single-fetch payloads (see spike notes) |
| `src/json-tree.js` | collapsible JSON tree renderer |
| `src/injected.js` | MAIN-world page bridge (live router + fetch capture) |
| `src/content.js` | ISOLATED relay: page → extension |
| `src/background.js` | routes bridge messages to the right panel |

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
