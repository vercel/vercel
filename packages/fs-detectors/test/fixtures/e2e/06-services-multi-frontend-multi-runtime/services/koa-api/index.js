const Koa = require('koa');

const app = new Koa();

app.use(async (ctx, next) => {
  if (ctx.path === '/') {
    ctx.body = { message: 'Hello from Koa' };
    return;
  }

  if (ctx.path === '/ping') {
    ctx.body = { message: 'pong from Koa' };
    return;
  }

  await next();
});

app.use(ctx => {
  ctx.status = 404;
  ctx.body = { detail: '404 from Koa' };
});

module.exports = app;
