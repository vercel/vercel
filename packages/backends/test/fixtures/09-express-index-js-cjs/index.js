import express from "express";
import subRouter from "./sub-router.js";

const app = express();

app.get("/", (req, res) => res.send("Hello World"));

app.use("/sub-router", subRouter);

app.get("/blog/*slugs", (req, res) => res.send("Hello World"));

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
