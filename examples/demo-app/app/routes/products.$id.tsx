import { Link } from "react-router";

// Two fake products. Navigating 1 -> 2 keeps the same route id but changes the
// data, which is exactly what the Loader Data "Diff" toggle highlights.
const PRODUCTS: Record<string, any> = {
  "1": { name: "Blue Widget", price: 125, inStock: true, tags: ["widgets", "blue"], rating: 4.6 },
  "2": { name: "Red Gizmo", price: 98.5, inStock: false, tags: ["gizmos", "red", "clearance"], rating: 4.1 },
};

export async function loader({ params, request }: { params: { id: string }; request: Request }) {
  const id = params.id in PRODUCTS ? params.id : "1";
  console.log(`[products.loader] loading product ${id}`);

  // A SERVER-SIDE fetch — the browser never issues this. The dev plugin captures
  // it as an `ssr` row. The response is large and maxBody is small, so the panel
  // marks exactly where it was truncated.
  let pricing: any = null;
  try {
    const res = await fetch(new URL(`/api/pricing?id=${id}`, request.url));
    pricing = await res.json();
    console.info(`[products.loader] pricing resolved for ${id}`);
  } catch (e) {
    console.error(`[products.loader] pricing fetch failed for ${id}`, e);
  }

  const base = PRODUCTS[id];
  // Rich types that JSON can't carry but turbo-stream (and this panel) can.
  return {
    id,
    name: base.name,
    price: base.price,
    inStock: base.inStock,
    tags: base.tags,
    rating: base.rating,
    fetchedAt: new Date(),
    catalogId: 90071992547409910n,
    totals: new Map<string, number>([
      ["today", base.price * 3],
      ["week", base.price * 19],
    ]),
    warehouses: new Set(["hkg", "sfo", "fra"]),
    note: undefined,
    pricing,
    rows: [
      { sku: `${id}-A`, qty: 12 },
      { sku: `${id}-B`, qty: 3 },
    ],
  };
}

export default function Product({ loaderData }: { loaderData: any }) {
  const d = loaderData;
  return (
    <main>
      <p><Link to="/">← home</Link></p>
      <h1>{d.name}</h1>
      <div className="card">
        <dl className="kv">
          <dt>id</dt><dd>{d.id}</dd>
          <dt>price</dt><dd>${d.price}</dd>
          <dt>in stock</dt><dd>{String(d.inStock)}</dd>
          <dt>rating</dt><dd>{d.rating}</dd>
          <dt>tags</dt><dd>{d.tags.join(", ")}</dd>
        </dl>
      </div>
      <nav>
        <Link to="/products/1">Product 1</Link>
        <Link to="/products/2">Product 2</Link>
        <Link to="/dashboard">Dashboard</Link>
      </nav>
      <p className="muted">
        Open the panel's <strong>Loader Data</strong> tab to see the decoded
        Date / Map / Set / BigInt, and the <strong>Routes</strong> tab for the
        matched tree. The pricing lookup shows up as an <code>ssr</code> row.
      </p>
    </main>
  );
}
