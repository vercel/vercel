import express from 'express';

const app = express();

app.get('/', (_req, res) => res.send('Hello World'));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const a: number = 'string';

export default app;
