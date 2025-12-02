// routes/listing.js
const express = require("express");
const router = express.Router();

router.get("/:id", (req, res) => {
  res.send("Hello World");
});

module.exports = router;
