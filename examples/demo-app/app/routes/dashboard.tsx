import { Link } from "react-router";

export function loader() {
  // Populate the Console pane with a spread of levels.
  console.log("[dashboard.loader] building metrics");
  console.warn("[dashboard.loader] inventory feed is 4 min stale");
  console.error("[dashboard.loader] upstream timeout on /catalog/inventory");
  return {
    updatedAt: new Date(),
    skus: 1240,
    lowStock: 18,
    topCategories: [
      { name: "widgets", sold: 4120 },
      { name: "gizmos", sold: 3980 },
      { name: "sprockets", sold: 2110 },
    ],
  };
}

export default function Dashboard({ loaderData }: { loaderData: any }) {
  const d = loaderData;
  return (
    <main>
      <p><Link to="/">← home</Link></p>
      <h1>Dashboard</h1>
      <div className="card">
        <dl className="kv">
          <dt>SKUs</dt><dd>{d.skus}</dd>
          <dt>low stock</dt><dd>{d.lowStock}</dd>
          <dt>top category</dt><dd>{d.topCategories[0].name}</dd>
        </dl>
      </div>
      <p className="muted">
        This route logs at <code>warn</code> and <code>error</code> too — good for
        the Console pane's level filter chips.
      </p>
    </main>
  );
}
