import { Hono } from 'hono'
import { sign } from './lib/sign'

sign({ foo: 'bar' }, 'secret')

const app = new Hono()

app.get('/', (c) => {
  return c.text('Hello World')
})

app.get('/users/:id', (c) => {
  return c.text(`User ID: ${c.req.param('id')}`)
})

export default app
