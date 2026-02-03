const { Hono } = require('hono');

const basePath = process.env.VERCEL_SERVICE_BASE_PATH || '';
const app = new Hono().basePath(basePath);

app.get('/', c =>
  c.json({
    framework: 'hono',
    service: 'service-hono',
  })
);

module.exports = app;
