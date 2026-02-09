import { Hono } from "hono";

// @ts-expect-error
import { info as cjsFsRead } from "./lib/cjs-fs-read.js";
import { info as esmFsRead } from "./lib/esm-fs-read";
// @ts-expect-error
import { info as cjsRequiringCjs } from "./lib/cjs-requiring-cjs";
import { info as esmImportingCjs } from "@/esm-importing-cjs";
import { echo as echoWithDep } from '@repo/echo-with-dep/src'
import { sign } from "jsonwebtoken";

console.log('cjsRequiringCjs', cjsRequiringCjs())
console.log('esmImportingCjs', esmImportingCjs())
console.log('esmFsRead', esmFsRead())
console.log('cjsFsRead', cjsFsRead())
console.log('echoWithDep', echoWithDep('hello from the server'))
console.log("sign", sign({ message: "hello from the server" }, "secret"));

const app = new Hono();

app.get("/", (c) => {
  return c.text("Hello World");
});

app.get("/echo", (c) => {
  return c.text(sign({ message: "hello from the server" }, "secret"));
});

export default app;
