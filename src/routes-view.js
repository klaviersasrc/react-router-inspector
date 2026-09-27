// Build the Routes-view data from RR matches + keyed loaderData.
// Pure (no DOM) → unit-testable; see test/routes-view.test.mjs.
// matches: [{id, pathname, params}] (or legacy string ids, top→leaf order).
// loaderData: object keyed by route id. Returns an array of
// {id, pathname?, params?, loaderData?} (the matched route hierarchy), or null.
(function (root) {
  root.rrRoutesView = function (matches, loaderData) {
    if (!Array.isArray(matches) || !matches.length) return null;
    const ld = loaderData && typeof loaderData === "object" ? loaderData : {};
    return matches.map((m) => {
      const id = typeof m === "string" ? m : m && m.id;
      const o = { id };
      if (m && typeof m === "object") {
        if (m.pathname) o.pathname = m.pathname;
        if (m.params && Object.keys(m.params).length) o.params = m.params;
      }
      if (id != null && Object.prototype.hasOwnProperty.call(ld, id)) o.loaderData = ld[id];
      return o;
    });
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
