const express = require('express');

const router = express.Router();

router.get(`/`, (req, res) => {
  res.json({
    framework: 'express',
    service: 'service-express',
  });
});

app = express();
app.use(express.json());
app.use(process.env.VERCEL_SERVICE_ROUTE_PREFIX, router);

module.exports = app;
