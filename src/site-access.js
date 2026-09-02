// Per-site bridge access for deployed React Router applications.
//
// Localhost remains enabled by the static manifest. Other HTTP(S) origins are
// enabled only after the user clicks "Enable this site" in the DevTools panel.
(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.RRInspectorSiteAccess = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function originPattern(rawUrl) {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `${url.origin}/*`;
  }

  function isBuiltInOrigin(rawUrl) {
    const url = new URL(rawUrl);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname.endsWith(".localhost"))
    );
  }

  function hash(value) {
    let result = 2166136261;
    for (let i = 0; i < value.length; i++) {
      result ^= value.charCodeAt(i);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(36);
  }

  function registrations(pattern) {
    const suffix = hash(pattern);
    return [
      {
        id: `rr-inspector-isolated-${suffix}`,
        matches: [pattern],
        js: ["src/content.js"],
        runAt: "document_start",
        world: "ISOLATED",
        persistAcrossSessions: true,
      },
      {
        id: `rr-inspector-main-${suffix}`,
        matches: [pattern],
        js: ["src/injected.js"],
        runAt: "document_start",
        world: "MAIN",
        persistAcrossSessions: true,
      },
    ];
  }

  async function hasPermission(chromeApi, pattern) {
    return chromeApi.permissions.contains({ origins: [pattern] });
  }

  async function ensureRegistered(chromeApi, pattern) {
    const desired = registrations(pattern);
    const ids = desired.map((script) => script.id);
    const existing = await chromeApi.scripting.getRegisteredContentScripts({ ids });

    if (existing.length === desired.length) return false;

    if (existing.length > 0) {
      await chromeApi.scripting.unregisterContentScripts({
        ids: existing.map((script) => script.id),
      });
    }

    await chromeApi.scripting.registerContentScripts(desired);
    return true;
  }

  async function requestAndRegister(chromeApi, pattern) {
    const granted = await chromeApi.permissions.request({ origins: [pattern] });
    if (!granted) return false;

    await ensureRegistered(chromeApi, pattern);
    return true;
  }

  return {
    ensureRegistered,
    hasPermission,
    isBuiltInOrigin,
    originPattern,
    registrations,
    requestAndRegister,
  };
});
