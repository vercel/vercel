import { useEffect } from "react";
import { useFetcher } from "react-router";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Repro: .data suffix routing" },
    {
      name: "description",
      content:
        "Reproduces React Router v7 single-fetch .data suffix routing on Vercel",
    },
  ];
}

type ClustersData = {
  servedBy: string;
  url: string;
  clusters: Array<{ id: number; lat: number; lon: number; count: number }>;
};

export default function Home() {
  const fetcher = useFetcher<ClustersData>();

  useEffect(() => {
    if (fetcher.state === "idle" && !fetcher.data) {
      fetcher.load("/api/getClusters");
    }
  }, [fetcher]);

  return (
    <main>
      <h1>React Router v7 single-fetch .data repro</h1>
      <p>
        The client calls <code>fetcher.load("/api/getClusters")</code>. React
        Router's single-fetch rewrites the network request to{" "}
        <code>/api/getClusters.data</code>. Inspect the response{" "}
        <code>servedBy</code> field to see which function handled it.
      </p>
      <h2>State: {fetcher.state}</h2>
      <pre>{JSON.stringify(fetcher.data, null, 2)}</pre>
    </main>
  );
}
