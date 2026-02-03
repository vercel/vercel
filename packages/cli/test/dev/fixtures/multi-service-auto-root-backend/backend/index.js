const express = require('express');

const app = express();
const basePath = process.env.VERCEL_SERVICE_BASE_PATH || '';

app.get(`${basePath}/`, (_req, res) => {
  res.json({
    message: 'Hello from auto-detected backend!',
    service: 'backend',
  });
});

app.get(`${basePath}/status`, (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(process.env.PORT || 3000);
