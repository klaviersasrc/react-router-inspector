# RR Inspector — demo app

A tiny **React Router v7** (framework mode) app whose only job is to light up
every feature of the React Router Inspector panel with neutral, fake data — for
**store screenshots** and **manual testing**. It is not published and ships no
real content.

## Run it

```bash
cd examples/demo-app
npm install
npm run dev            # Vite dev server (default http://localhost:5173)
```

Then open the app in Chrome with the unpacked extension loaded → DevTools
(⌥⌘I) → the **React Router** tab.

The dev-only inspector Vite plugin is already wired in `vite.config.ts` (imported
straight from this repo's `server-bridge/`), so `server` logs and `ssr` rows work
out of the box.

## What each page exercises

| Page / action | Panel feature it shows |
|---|---|
| **Home** (`/`) | on mount: a browser REST call (`api` row), a GraphQL call (`gql` row), and browser console logs incl. an object (grouping) |
| **Product 1 → Product 2** | same route id, changed data → the **Loader Data → Diff** toggle; decoded **Date / Map / Set / BigInt / undefined**; the **Routes** tab's matched tree |
| product loader's pricing lookup | a **server-side** fetch → an `ssr` row, deliberately **truncated** (low `maxBody`) so the response shows the **⚠ truncated** marker |
| **Dashboard** | server `log` / `warn` / `error` → the Console pane's **level filter chips** |

## Suggested capture order (for the four store shots)

1. **Loader Data + diff** — visit Product 1 then Product 2, select the Product 2
   `router` row, Loader Data tab, click **Diff**.
2. **Routes** — same selection, **Routes** tab, expand the tree.
3. **Console** — toggle **Console** in the toolbar; a SERVER line + a browser line
   + level chips visible; a decoded/truncated body in the pane above.
4. **Payload** — select the `gql` row, **Payload** tab, keep the Copy JSON / URL /
   cURL buttons in frame.

Normalize the captures to exactly 1280×800 with the `sips` snippet in
[`../../docs/CHROME-STORE.md`](../../docs/CHROME-STORE.md) (§4a).
