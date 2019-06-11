/* eslint-disable prefer-destructuring */
const express = require('express');

const app = express();

module.exports = app;

app.use(express.json());

app.all('*', (req, res) => {
  res.status(200);

  let who = 'anonymous';

  if (req.body && req.body.who) {
    who = req.body.who;
  }

  res.send(`hello ${who}:RANDOMNESS_PLACEHOLDER`);
});
