import { Hono } from 'hono';

const app = new Hono();

app.get('/', c => {
  c.body.someNonExistentMethod();
  return c.text('Hello World');
});

export default app;
