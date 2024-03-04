import { Links, LiveReload, Meta, MetaFunction, Outlet, Scripts, ScrollRestoration } from "@remix-run/react"
import * as React from "react"

export const meta: MetaFunction = () => {
  return [{ title: "Hello" }, { name: "description", content: "World" }]
}

export default function App() {
  return (
    <Document>
      <Outlet />
    </Document>
  )
}

export function ErrorBoundary() {
  return (
    <Document>
      <h2>error</h2>
    </Document>
  )
}

interface DocumentProps {
  children: React.ReactNode
}

function Document({ children }: DocumentProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />

        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  )
}
