import express from 'express';

const app = express();

app.get('/', (req, res) => {
  req.someNonExistentMethod();
  res.send('Hello World');
});

export default app;
