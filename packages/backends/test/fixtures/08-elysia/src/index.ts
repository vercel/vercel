import { Elysia } from "elysia";

const runtime = typeof globalThis.Bun !== "undefined" ? "bun" : "node";

const app = new Elysia()
  .get("/", () => `Hello from Elysia, running on ${runtime}`)
  .get("/user/:id", ({ params: { id } }) => id)
  .post("/form", ({ body }) => body);

export default app;
