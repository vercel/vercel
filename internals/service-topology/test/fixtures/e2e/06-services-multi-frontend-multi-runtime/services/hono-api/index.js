import { Hono } from 'hono';

const app = new Hono();

app.get('/', c => {
  return c.json({ message: 'Hello from Hono' });
});

app.get('/ping', c => {
  return c.json({ message: 'pong from Hono' });
});

app.notFound(c => {
  return c.json({ detail: '404 from Hono' }, 404);
});

export default app;
