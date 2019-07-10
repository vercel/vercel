const express = require('express');

const app = express();
app.use(express.static('templates'));

app.listen();
