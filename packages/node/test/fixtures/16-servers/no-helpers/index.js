const express = require('express');

const app = express();

app.all('*', (req, res) => {
  const areHelpersAvailable = typeof req.body !== 'undefined';

  res.end(`${areHelpersAvailable ? 'yes' : 'no'}:RANDOMNESS_PLACEHOLDER`);
});

module.exports = app;
