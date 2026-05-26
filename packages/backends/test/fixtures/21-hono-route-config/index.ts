import { Hono } from 'hono';

// `@vercel/backends` reads this well-known symbol off any Hono sub-app
// mounted via `app.route(path, subApp)` and pins each route the sub-app
// contributes to a dedicated Vercel Function carrying the stamped config
// (regions, memory, maxDuration, …). The symbol is `Symbol.for(...)`-keyed
// so it survives the introspection process boundary and any version skew
// between user code and the builder.
const VERCEL_CONFIG = Symbol.for('@vercel/backends.config');

const iad1 = new Hono();
(iad1 as any)[VERCEL_CONFIG] = { regions: ['iad1'] };
iad1.get('/api/iad1/hello', c => c.text('hello from iad1'));
iad1.get('/api/iad1/world', c => c.text('world from iad1'));

const sfo1 = new Hono();
(sfo1 as any)[VERCEL_CONFIG] = {
  regions: ['sfo1'],
  functionFailoverRegions: ['pdx1'],
};
sfo1.get('/api/sfo1/hello', c => c.text('hello from sfo1'));

const fra1 = new Hono();
(fra1 as any)[VERCEL_CONFIG] = { regions: ['fra1'] };
fra1.get('/api/fra1/hello', c => c.text('hello from fra1'));

const app = new Hono();

app.get('/', c => c.text('default'));

// Routes registered on untagged sub-apps (or the parent app directly) land
// on the default Lambda — same region/memory as the project default.
app.get('/api/health', c => c.json({ ok: true }));

app.route('/', iad1);
app.route('/', sfo1);
app.route('/', fra1);

export default app;
