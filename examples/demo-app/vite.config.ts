import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
// The dev-only inspector plugin, imported straight from this repo's source so the
// demo exercises the real bridge (in your own project you'd copy the .mjs in).
import rrInspector from "../../server-bridge/vite-plugin-rr-inspector.mjs";

export default defineConfig({
  plugins: [
    // maxBody caps the request/response bodies the plugin streams. 2 MB (the
    // plugin default) captures the demo's responses in full. Lower it (e.g. 800)
    // if you want to demo the panel's "⚠ truncated" marker.
    rrInspector({ maxBody: 2_000_000 }),
    reactRouter(),
  ],
});
