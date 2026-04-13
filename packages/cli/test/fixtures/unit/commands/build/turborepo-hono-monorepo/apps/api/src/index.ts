import { Hono } from "hono";
import { echo } from "@repo/echo";

// This message is checked by the test to verify the function executes correctly
console.log("VERCEL_TEST_MARKER:turborepo-hono-monorepo");

const app = new Hono();

app.get("/", (c) => {
  return c.text(echo("Hello from the Hono API"));
});
app.get("/echo", (c) => {
  return c.text(echo("Hello from the Hono API"));
});

export default app;
