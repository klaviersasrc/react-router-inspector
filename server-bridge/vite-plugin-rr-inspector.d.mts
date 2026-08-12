import type { Plugin } from "vite";

export interface RrInspectorOptions {
  /** Max characters per captured console line (default 8000). */
  maxLine?: number;
  /** Max characters per request/response body (default 2_000_000 ≈ 2 MB; Infinity to disable). */
  maxBody?: number;
  /** Drop browser logs that Vite forwards to the terminal ("[vite] (client)"). Default true. */
  dropViteClientEcho?: boolean;
  /** How many recent events to replay to a newly-connected panel (default 300). */
  bufferMax?: number;
}

/**
 * Dev-only Vite plugin (apply: "serve") that streams the server terminal output
 * and server-side fetch calls to the React Router Inspector DevTools extension.
 */
export default function rrInspector(options?: RrInspectorOptions): Plugin;
