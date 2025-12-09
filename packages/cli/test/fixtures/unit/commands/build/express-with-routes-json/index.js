const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Hello World');
});

app.get('/users/:id', (req, res) => {
  res.send(`User ${req.params.id}`);
});

app.get('/api/posts/:postId', (req, res) => {
  res.send(`Post ${req.params.postId}`);
});

module.exports = app;

