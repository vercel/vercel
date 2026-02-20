import { Hono } from 'hono';
import { xxh64 } from '@node-rs/xxhash';

const app = new Hono();

app.get('/', (c) => {
  // Use xxhash to hash a simple string
  const hash = xxh64('hello world').toString(16);
  return c.json({
    message: 'xxhash native bindings loaded successfully',
    hash,
    input: 'hello world',
  });
});

app.get('/hash/:input', (c) => {
  const input = c.req.param('input');
  const hash = xxh64(input).toString(16);
  return c.json({
    input,
    hash,
  });
});

export default app;
