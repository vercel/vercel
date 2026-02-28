import type { Route } from "./+types/home";
import { Welcome } from "../components/welcome";
import { authMiddleware } from "../middleware/auth";
import { userContext } from "../context";

// Attach the auth middleware — it runs before the loader on every request
export const middleware: Route.MiddlewareFunction[] = [
  authMiddleware,
];

export function meta({}: Route.MetaArgs) {
  return [
    { title: "React Router Middleware Demo" },
    {
      name: "description",
      content: "Demonstrating React Router middleware with context injection",
    },
  ];
}

// The loader reads the user that the middleware placed on context
export function loader({ context }: Route.LoaderArgs) {
  const user = context.get(userContext);
  return { user };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  if (!loaderData.user) {
    return <p>Not authenticated.</p>;
  }
  return <Welcome user={loaderData.user} />;
}
