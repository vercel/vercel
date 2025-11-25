const express = require('express');
const path = require('path');

const {join} = path;

const app = express();

// Set view engine and views directory
app.set('view engine', 'pug');
app.set('views', join(__dirname, 'pug-views'));

app.get('/', (req, res) => {
  res.render('index', { title: 'Home', message: 'Hello from Pug!' });
});

app.get('/user/:id', (req, res) => {
  res.render('user', { userId: req.params.id });
});

app.get('/api/data', (req, res) => {
  res.json({ data: 'API response' });
});

module.exports = app;

