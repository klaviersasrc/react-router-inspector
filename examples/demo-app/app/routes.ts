import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("products/:id", "routes/products.$id.tsx"),
  route("dashboard", "routes/dashboard.tsx"),

  // Resource routes (no UI) used as fetch targets so the panel shows
  // api / gql / ssr rows against something real.
  route("api/reviews", "routes/api.reviews.tsx"),
  route("api/pricing", "routes/api.pricing.tsx"),
  route("graphql", "routes/graphql.tsx"),
] satisfies RouteConfig;
