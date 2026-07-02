import { Hono } from 'hono';

const app = new Hono();

app.get('/', c => {
  return c.text('Hello from standalone Hono');
});

export default app;
