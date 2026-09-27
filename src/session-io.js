// Export / import a captured session (events + console logs) as JSON.
// Pure (no DOM) → unit-testable; see test/session-io.test.mjs.
(function (root) {
  const FORMAT = "rr-inspector-session";
  // Header names whose VALUES are stripped on export by default.
  const SENSITIVE = new Set(["authorization", "cookie", "set-cookie", "proxy-authorization", "x-api-key", "x-auth-token"]);

  function redactHeaders(h) {
    if (!h || typeof h !== "object") return h;
    const out = {};
    for (const k of Object.keys(h)) out[k] = SENSITIVE.has(k.toLowerCase()) ? "[redacted]" : h[k];
    return out;
  }
  function redactEvent(ev) {
    const e = Object.assign({}, ev);
    if (e.reqHeaders) e.reqHeaders = redactHeaders(e.reqHeaders);
    if (e.resHeaders) e.resHeaders = redactHeaders(e.resHeaders);
    return e;
  }

  // Build the serializable session object. redact !== false → strip auth/cookie header values.
  root.rrExportSession = function (events, consoleLogs, opts) {
    const redact = !opts || opts.redact !== false;
    return {
      format: FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      redacted: redact,
      events: (events || []).map(redact ? redactEvent : (e) => e),
      consoleLogs: (consoleLogs || []).slice(),
    };
  };
  // Validate + unwrap an imported object. Throws on the wrong shape.
  root.rrImportSession = function (obj) {
    if (!obj || obj.format !== FORMAT || !Array.isArray(obj.events)) {
      throw new Error("Not a React Router Inspector session file");
    }
    return { events: obj.events, consoleLogs: Array.isArray(obj.consoleLogs) ? obj.consoleLogs : [] };
  };
  root.rrRedactHeaders = redactHeaders;
})(typeof globalThis !== "undefined" ? globalThis : this);
