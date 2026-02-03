const express = require('express');

const app = express();
const basePath = process.env.VERCEL_SERVICE_ROUTE_PREFIX || '';

app.get(`${basePath}/`, (_req, res) => {
  res.json({
    framework: 'express',
    service: 'service-express',
  });
});

app.listen(process.env.PORT || 3000);
