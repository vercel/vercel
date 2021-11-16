const Koa = require('koa');

const app = new Koa();

app.use(async ctx => {
  ctx.body = 'hello from koa:RANDOMNESS_PLACEHOLDER';
});

module.exports = app;
