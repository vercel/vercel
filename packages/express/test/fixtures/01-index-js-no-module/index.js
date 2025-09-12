import express from "express";

const app = express();

app.get("/", (req, res) => res.send("Hello World"));
app.get("/test", (req, res) => res.send("Test"));
app.get("/users/:name", (req, res) => res.send(`Hello ${req.params.name}`));
app.get("/:foo/:bar", (req, res) => res.send(`Hello ${req.params.foo} ${req.params.bar}`));
app.get("/*splat", (req, res) => res.send(`Hello ${req.params.splat}`));
app.delete("/users{/:id}/delete", (req, res) => res.send("Deleted"));

export default app;
