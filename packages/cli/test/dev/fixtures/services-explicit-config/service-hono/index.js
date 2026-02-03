const { Hono } = require('hono');

const app = new Hono().basePath(process.env.VERCEL_SERVICE_ROUTE_PREFIX);

app.get('/', c =>
  c.json({
    framework: 'hono',
    service: 'service-hono',
  })
);

module.exports = app;
