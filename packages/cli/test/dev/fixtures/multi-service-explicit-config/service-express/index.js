const express = require('express');

const basePath = process.env.VERCEL_SERVICE_BASE_PATH || '';
const app = express();

app.get(`${basePath}/`, (req, res) => {
  res.json({
    framework: 'express',
    service: 'service-express',
  });
});

module.exports = app;
