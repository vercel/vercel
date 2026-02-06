import express from "express";
import fs from 'fs'
import path from 'node:path'
import { echo } from "./lib/echo.js";
import { fileURLToPath } from "node:url";
import { echo2 } from "./lib/echo-2.cjs";

const info = fileURLToPath(path.join(path.dirname(import.meta.url), 'info.md'))
console.log(fs.readFileSync(info, 'utf8'))

const app = express();

app.get("/", (req, res) => res.send("Hello World"));

app.get("/user/:id", (req, res) => res.send(echo("Hello World")));

app.get("/user/:id/echo2", (req, res) => res.send(echo2("Hello World")));

app.get("/user/:id/posts", (req, res) => res.send("Hello World"));

app.get("/blog/*slugs", (req, res) => res.send("Hello World"));

export default app;
