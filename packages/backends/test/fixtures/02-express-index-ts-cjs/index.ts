import express from "express";
import { join } from "node:path";
import fs from "node:fs";

const app = express();

const info = fs.readFileSync(join(__dirname, 'info.md'), 'utf8');
console.log('reading...');
console.log({ info });

app.get("/", (req, res) => res.send("Hello World"));

app.get("/user/:id", (req, res) => res.send("Hello World"));

app.get("/user/:id/posts", (req, res) => res.send("Hello World"));

app.get("/blog/*slugs", (req, res) => res.send("Hello World"));

export default app;
