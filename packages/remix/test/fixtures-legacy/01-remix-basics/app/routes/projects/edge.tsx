import { useLoaderData } from "@remix-run/react";

// `"runtime": "edge"` is implied here because the parent route defined it

export async function loader() {
  const isEdge = typeof process.version === 'undefined';
  return { isEdge };
}

export default function Edge() {
  const data = useLoaderData<typeof loader>();
  return <div>{JSON.stringify(data)}</div>;
}
