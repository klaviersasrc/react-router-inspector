import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
// Linked, not inlined: an inline <style> with quoted font names hydration-mismatches
// (React SSR-escapes the quotes to &quot; but the client keeps them raw).
import stylesUrl from "./app.css?url";

export const links = () => [{ rel: "stylesheet", href: stylesUrl }];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>RR Inspector Demo</title>
        <Meta />
        <Links />
      </head>
      <body>
        <div className="wrap">{children}</div>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}
