import { useLoaderData } from "@remix-run/react";

// Explicitly override the `"runtime": "edge"` defined by the parent route
export const config = { runtime: 'nodejs' };

export async function loader() {
  const isEdge = typeof process.version === 'undefined';
  return { isEdge };
}

export default function Node() {
  const data = useLoaderData<typeof loader>();
  return <div>{JSON.stringify(data)}</div>;
}
