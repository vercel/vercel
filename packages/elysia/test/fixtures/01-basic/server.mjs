import { Elysia } from "elysia";

const app = new Elysia().get("/", () => "Hello from Elysia");

export default app;

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}. from ${runtime}`
);
