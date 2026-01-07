import { Hono } from "hono";
import { echo } from "@repo/echo";
import { echo as echo2 } from "@repo/echo-2";

// This message is checked by the test to verify the function executes correctly
console.log("VERCEL_TEST_MARKER:turborepo-hono-monorepo");

const app = new Hono();

app.get("/", (c) => {
  return c.text(echo("Hello from the Hono API"));
});

app.get("/echo-2", (c) => {
  return c.text(echo2("Hello from the Hono API"));
});

export default app;
