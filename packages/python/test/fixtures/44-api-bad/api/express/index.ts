import express from 'express';

const app = express();

app.get('/api/express', (req, res) => {
  res.json({ message: 'express ok' });
});

app.get('/api/express/:name', (req, res) => {
  const name = req.params.name || 'world';
  res.json({ message: `hello ${name}!` });
});

export default app;
