// External module — MV3 extension pages forbid INLINE scripts (CSP script-src 'self'),
// so the turbo-stream decoder is loaded from this file, not inline in panel.html.
// Exposes window.decodeTurboStream for the classic panel script.
import { decode } from "./vendor/turbo-stream.mjs";

window.decodeTurboStream = async (text) => {
  const { value, done } = await decode(new Response(text).body);
  await done; // resolve any deferred/streamed chunks in a buffered body
  return value;
};
