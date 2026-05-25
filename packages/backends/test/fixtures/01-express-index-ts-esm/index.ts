import express from 'express';
import fs from 'fs';
import { echo } from "./lib/echo.js";
import { fileURLToPath } from "node:url";
import { echo2 } from "./lib/echo-2.cjs";

const info = fileURLToPath(new URL('./info.md', import.meta.url));
console.log(fs.readFileSync(info, 'utf8'));

const app = express();

app.get("/", (req, res) => res.send("Hello World"));

app.get("/user/:id", (req, res) => res.send(echo("Hello World")));

app.get("/user/:id/echo2", (req, res) => res.send(echo2("Hello World")));

app.get("/user/:id/posts", (req, res) => res.send("Hello World"));

app.get("/blog/*slugs", (req, res) => res.send("Hello World"));

export default app;
