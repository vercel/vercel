const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Hello Express!');
});

app.get('/api/users/:id', (req, res) => {
  res.json({ id: req.params.id });
});

app.get('/special/chars/!@#$%^&*()', (req, res) => {
  res.send('Special chars route');
});

module.exports = app;
