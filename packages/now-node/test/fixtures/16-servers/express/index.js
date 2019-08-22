const express = require('express');

const app = express();

app.all('*', (req, res) => {
  res.send('hello from express:RANDOMNESS_PLACEHOLDER');
});

module.exports = app;
