// Minimal collapsible JSON tree renderer. No deps. Exposes window.renderJsonTree.
(function () {
  function typeOf(v) {
    if (v === null) return "null";
    if (v === undefined) return "undefined";
    if (Array.isArray(v)) return "array";
    if (v instanceof Date) return "date";
    if (v instanceof Map) return "map";
    if (v instanceof Set) return "set";
    if (typeof v === "bigint") return "bigint";
    return typeof v; // string | number | boolean | object | function
  }
  function leaf(v) {
    const t = typeOf(v);
    const span = document.createElement("span");
    if (t === "string") { span.className = "s"; span.textContent = JSON.stringify(v); }
    else if (t === "number") { span.className = "n"; span.textContent = String(v); }
    else if (t === "bigint") { span.className = "n"; span.textContent = String(v) + "n"; }
    else if (t === "boolean") { span.className = "b"; span.textContent = String(v); }
    else if (t === "null") { span.className = "nul"; span.textContent = "null"; }
    else if (t === "undefined") { span.className = "nul"; span.textContent = "undefined"; }
    else if (t === "date") { span.className = "s"; span.textContent = `Date(${v.toISOString()})`; }
    else { span.textContent = String(v); }
    return span;
  }
  function entriesOf(t, v) {
    if (t === "array") return v.map((x, i) => [i, x]);
    if (t === "set") return [...v].map((x, i) => [i, x]);
    if (t === "map") return [...v.entries()].map(([k, x]) => [typeof k === "object" ? JSON.stringify(k) : String(k), x]);
    return Object.entries(v);
  }
  function preview(v) {
    const t = typeOf(v);
    if (t === "array") return `Array(${v.length})`;
    if (t === "set") return `Set(${v.size})`;
    if (t === "map") return `Map(${v.size})`;
    if (t === "object") {
      const keys = Object.keys(v);
      return `{ ${keys.slice(0, 4).join(", ")}${keys.length > 4 ? ", …" : ""} }`;
    }
    return "";
  }
  function node(key, val, depth) {
    const row = document.createElement("div");
    row.className = "row";
    row.style.paddingLeft = depth * 14 + "px";
    const t = typeOf(val);
    const isContainer = t === "object" || t === "array" || t === "map" || t === "set";

    const tw = document.createElement("span");
    tw.className = "tw";
    row.appendChild(tw);

    if (key !== null) {
      const k = document.createElement("span");
      k.className = "k";
      k.textContent = /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
      row.appendChild(k);
      row.appendChild(document.createTextNode(": "));
    }

    if (!isContainer) {
      row.appendChild(leaf(val));
      return row;
    }

    const wrap = document.createElement("div");
    wrap.appendChild(row);
    const pv = document.createElement("span");
    pv.className = "preview";
    pv.textContent = preview(val);
    row.appendChild(pv);

    const children = document.createElement("div");
    children.className = "children";
    const entries = entriesOf(t, val);
    for (const [k, v] of entries) children.appendChild(node(String(k), v, depth + 1));
    wrap.appendChild(children);

    tw.textContent = depth < 1 ? "▾" : "▸";
    if (depth >= 1) wrap.classList.add("collapsed");
    const toggle = () => {
      const c = wrap.classList.toggle("collapsed");
      tw.textContent = c ? "▸" : "▾";
    };
    tw.addEventListener("click", toggle);
    pv.addEventListener("click", toggle);
    return wrap;
  }
  window.renderJsonTree = function (value) {
    const root = document.createElement("div");
    root.className = "jt";
    root.appendChild(node(null, value, 0));
    return root;
  };
})();
