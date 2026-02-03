const express = require('express');

const app = express();
const basePath = process.env.VERCEL_SERVICE_BASE_PATH || '';

app.get(`${basePath}/`, (_req, res) => {
  res.json({
    message: 'Hello from backend service!',
    service: 'backend',
  });
});

app.get(`${basePath}/data`, (_req, res) => {
  res.json({ items: ['a', 'b', 'c'] });
});

app.listen(process.env.PORT || 3000);
