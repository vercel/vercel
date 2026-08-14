import type { MiddlewareFunction } from "react-router";
import { userContext } from "../context";

/**
 * Mock user that the middleware injects into the route context.
 * In a real app, this would come from a session, JWT, or database lookup.
 */
export const mockUser = {
  id: "usr_1234",
  name: "Jane Developer",
  email: "jane@example.com",
  role: "admin" as const,
  avatarUrl: "https://api.dicebear.com/9.x/avataaars/svg?seed=Jane",
};

export type User = typeof mockUser;

/**
 * Auth middleware — runs on every request matched by the route that
 * exports it. It places a mock user onto the type-safe `userContext`
 * so that loaders (and actions) downstream can read it without
 * duplicating the lookup logic.
 */
export const authMiddleware: MiddlewareFunction<Response> = async ({ context }) => {
  // Simulate an async auth check (e.g. verifying a cookie / token)
  await new Promise((res) => setTimeout(res, 5));

  // Inject the mock user into the type-safe context
  context.set(userContext, mockUser);
};
