import type { Route } from "./+types/home";

export function loader({ context }: Route.LoaderArgs) {
  return context;
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return <span>VALUE_FROM_HONO: {loaderData.VALUE_FROM_HONO}</span>;
}
