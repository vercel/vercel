import Koa from 'koa'

const app = new Koa()

app.use(async ctx => {
  if (ctx.path === '/') {
    ctx.body = 'Hello Koa!'
  } else if (ctx.path.startsWith('/api/users/')) {
    const id = ctx.path.split('/').pop()
    ctx.body = { id }
  } else {
    ctx.status = 404
    ctx.body = 'Not Found'
  }
})

export default app
