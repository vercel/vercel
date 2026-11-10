const express = require('express');

const app = express();

app.get('/', (_req, res) => {
  res.json({ message: 'Hello from Express' });
});

app.get('/ping', (_req, res) => {
  res.json({ message: 'pong from Express' });
});

app.use((_req, res) => {
  res.status(404).json({ detail: '404 from Express' });
});

module.exports = app;
