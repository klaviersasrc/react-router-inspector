// Partition events into groups by navigation. Pure → unit-testable; see test/group.test.mjs.
// Each non-nav event joins the LAST navigation whose START is <= its time. A nav's
// start is ev.navStart (captured when navigation begins) or, absent that, its own
// time. This is what makes a navigation's loader fetches — which fire DURING the
// navigation, before the rr-nav event settles — group with THAT nav instead of the
// previous one (the off-by-one the completion-time grouping had).
(function (root) {
  const timeOf = (ev) => Date.parse(ev && ev.time) || 0;
  const startOf = (n) => Date.parse((n && (n.navStart || n.time)) || 0) || 0;
  root.rrGroupByNav = function (events) {
    const list = Array.isArray(events) ? events : [];
    const navs = list.filter((e) => e && e.nav).slice().sort((a, b) => startOf(a) - startOf(b));
    const groups = navs.map((n) => ({ header: n, members: [] }));
    const leading = [];
    for (const c of list) {
      if (!c || c.nav) continue;
      const ct = timeOf(c);
      let idx = -1;
      for (let i = 0; i < navs.length; i++) { if (startOf(navs[i]) <= ct) idx = i; else break; }
      if (idx >= 0) groups[idx].members.push(c); else leading.push(c);
    }
    return { leading, groups };
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
