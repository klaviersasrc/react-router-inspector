import { useEffect } from "react";
import { Link } from "react-router";

export function loader() {
  // Server-side log — shows up as a SERVER line in the Console pane.
  console.log("[home.loader] rendering landing", { at: new Date().toISOString() });
  return { title: "React Router Inspector — demo" };
}

export default function Home({ loaderData }: { loaderData: { title: string } }) {
  useEffect(() => {
    // Browser-side logs — one plain line and one object (shows console grouping).
    console.info("[demo] home mounted");
    console.log("[demo] cart snapshot", { items: 3, subtotal: 84.5, currency: "USD" });
    console.warn("[demo] price still pending at first paint");

    // A browser REST call -> an `api` row.
    fetch("/api/reviews?product=1")
      .then((r) => r.json())
      .then((d) => console.log("[demo] reviews loaded", d.length))
      .catch(() => {});

    // A browser GraphQL call -> a `gql` row (labeled by operationName).
    fetch("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operationName: "ProductList",
        variables: { category: "widgets", inStockOnly: true },
        query: "query ProductList($category: String!, $inStockOnly: Boolean!) { products(category: $category, inStockOnly: $inStockOnly) { id name price } }",
      }),
    })
      .then((r) => r.json())
      .then((d) => console.log("[demo] graphql products", d?.data?.products?.length))
      .catch(() => {});
  }, []);

  return (
    <main>
      <h1>{loaderData.title}</h1>
      <p className="muted">
        A tiny React Router v7 app wired to the inspector's dev plugin. Open
        DevTools → the <strong>React Router</strong> tab, then click around — each
        navigation, fetch, and log streams into the panel.
      </p>
      <nav>
        <Link to="/products/1">Product 1</Link>
        <Link to="/products/2">Product 2 (see the diff)</Link>
        <Link to="/dashboard">Dashboard</Link>
      </nav>
      <div className="card">
        <strong>What to click for each screenshot</strong>
        <ul className="muted">
          <li>Visit <code>Product 1</code> then <code>Product 2</code> — the Loader
            Data tab's <em>Diff</em> toggle lights up (same route, changed data).</li>
          <li>Any product row → <em>Routes</em> tab shows the matched tree; the
            server-side pricing fetch appears as an <code>ssr</code> row.</li>
          <li>Toggle <em>Console</em> in the toolbar for browser + server logs.</li>
          <li>The GraphQL row → <em>Payload</em> tab → Copy JSON / URL / cURL.</li>
        </ul>
      </div>
    </main>
  );
}
