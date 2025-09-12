import express from "express";

const app = express();

app.get("/", (req, res) => res.send("Hello World"));
app.get("/test", (req, res) => res.send("Test"));
app.get("/users/:name", (req, res) => res.send(`Hello ${req.params.name}`));

export default app;
