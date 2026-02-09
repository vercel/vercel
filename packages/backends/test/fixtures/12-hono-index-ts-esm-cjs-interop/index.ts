import { Hono } from 'hono'
// @ts-ignore this tests a named import from cjs
import { sign } from 'jsonwebtoken'

sign({ foo: 'bar' }, 'secret')

const app = new Hono()

app.get('/', (c) => {
  return c.text('Hello World')
})

app.get('/users/:id', (c) => {
  return c.text(`User ID: ${c.req.param('id')}`)
})

export default app
