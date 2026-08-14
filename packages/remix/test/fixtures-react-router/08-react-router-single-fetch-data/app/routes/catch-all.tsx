import type { Route } from "./+types/catch-all";

export async function loader({ request }: Route.LoaderArgs) {
  const servedBy = "splat: *";
  return { servedBy, url: request.url };
}

export default function CatchAll({ loaderData }: Route.ComponentProps) {
  return (
    <main>
      <h1>Splat route</h1>
      <p>This request was served by the * route.</p>
      <pre>{JSON.stringify(loaderData, null, 2)}</pre>
    </main>
  );
}
