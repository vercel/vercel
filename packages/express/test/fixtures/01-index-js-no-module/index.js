import express from "express";

const app = express();

app.get("/", (req, res) => res.send("Hello World"));

app.get("/user/:id", (req, res) => res.send("Hello World"));

app.get("/user/:id/posts", (req, res) => res.send("Hello World"));

app.get("/blog/*slugs", (req, res) => res.send("Hello World"));


export default app;
