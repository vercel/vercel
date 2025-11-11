import { Hono } from 'hono';

const app = new Hono();
const honoRouter = new Hono();

honoRouter.get('/', c => c.text('hono ok'));

honoRouter.get('/bruh', c => c.text('hono bruh ok'));

app.route('/hono', honoRouter);

export default app;
