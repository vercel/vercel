const { Hono } = require("hono");
const { stuff } = require("./other/stuff.cjs");

const app = new Hono();

app.get("/", (c) => {
  console.log("GET /");
  return c.json({ message: `Hello Hono! from ${stuff}` });
});
app.get("/path/:id", (c) => {
  console.log("GET /path/:id");
  return c.json({ message: `Hello Hono! from ${c.req.param("id")}` });
});

module.exports = app;
