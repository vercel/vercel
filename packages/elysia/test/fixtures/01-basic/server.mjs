import { Elysia } from "elysia";

const app = new Elysia().get("/", () => `Hello Elysia from ${runtime}`);

export default app;

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}. from ${runtime}`
);
