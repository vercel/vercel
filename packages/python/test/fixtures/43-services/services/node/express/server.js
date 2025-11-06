const express = require('express');

const app = express();
const router = express.Router();

router.get('/', (req, res) => {
  res.send('express ok');
});

router.get('/bruh', (req, res) => {
  res.send('express bruh ok');
});

app.use('/express', router);

module.exports = app;
