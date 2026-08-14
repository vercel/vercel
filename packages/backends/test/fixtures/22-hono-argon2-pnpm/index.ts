import { Hono } from 'hono';
import argon2 from 'argon2';

const app = new Hono();

app.get('/', async (c) => {
  // Exercise the argon2 native addon at runtime. If the prebuilt `.node`
  // binary was corrupted during tracing (e.g. read as UTF-8), loading or
  // calling it throws — most notably with the pnpm `.pnpm` layout.
  const hash = await argon2.hash('password');
  const verified = await argon2.verify(hash, 'password');
  return c.json({ verified });
});

export default app;
