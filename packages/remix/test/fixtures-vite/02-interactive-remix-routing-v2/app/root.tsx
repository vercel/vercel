import type { LinksFunction, MetaFunction } from "@remix-run/node";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useMatches,
} from "@remix-run/react";
import tailwind from "~/tailwind.css?url";
import styles from "~/styles.css?url";
import Sidebar from "~/components/Sidebar";
import Header from "~/components/Header";
import Breadcrumbs from "~/components/Breadcrumbs";
import LayoutWrapper from "~/components/wrappers/LayoutWrapper";
import { useCallback, useMemo, useState } from "react";

export const meta: MetaFunction = () => {
  return [
    { title: "Remix Routing V2" },
    {
      property: "og:title",
      content: "Home Page",
    },
    {
      name: "description",
      content: "App to visualize remix routing version 2",
    },
  ];
};

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: tailwind },
  { rel: "stylesheet", href: styles },
];

export default function App() {
  const matches = useMatches();
  const [isDarkMode, setIsDarkMode] = useState(true);

  const themeProps = useMemo(() => {
    if (isDarkMode) {
      return { className: "dark" };
    }
    return {};
  }, [isDarkMode]);

  const toggleDarkMode = useCallback(() => {
    setIsDarkMode((current) => !current);
  }, []);

  return (
    <html lang="en" {...themeProps}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="bg-white dark:bg-zinc-900 text-black/80 dark:text-zinc-200">
        <Header toggleDarkMode={toggleDarkMode} isDarkMode={isDarkMode} />
        <Sidebar />
        <div style={{ paddingLeft: "400px" }}>
          <div className="max-w-3xl mx-auto px-4 pt-20">
            <Breadcrumbs matches={matches} />
            <div className="mt-8 px-4">
              <LayoutWrapper filePath="root.tsx">
                <Outlet />
              </LayoutWrapper>
            </div>
          </div>
        </div>

        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
