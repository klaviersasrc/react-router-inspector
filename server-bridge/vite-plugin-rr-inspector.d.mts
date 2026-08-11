import type { Plugin } from "vite";

export interface RrInspectorOptions {
  /** Max characters per captured log line / response body before truncation (default 8000). */
  maxLine?: number;
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
