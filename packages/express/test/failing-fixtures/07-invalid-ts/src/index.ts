import express from 'express';

const app = express();

app.get('/', (_req, res) => res.send('Hello World'));

const _a: number = 'string';

export default app;
