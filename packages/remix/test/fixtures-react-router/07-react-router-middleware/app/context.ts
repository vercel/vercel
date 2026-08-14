import { createContext } from "react-router";
import type { User } from "./middleware/auth";

/**
 * Type-safe context for the authenticated user.
 * Middleware sets this, loaders read it — no string keys, no casting.
 */
export const userContext = createContext<User | null>(null);
