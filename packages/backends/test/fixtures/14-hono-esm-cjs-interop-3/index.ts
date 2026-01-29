import { Hono } from 'hono'
// @ts-expect-error
import { sign } from './lib/my-cjs-file'

sign({ foo: 'bar' }, 'secret')

const app = new Hono()

app.get('/', (c) => {
  return c.text('Hello World')
})

app.get('/users/:id', (c) => {
  return c.text(`User ID: ${c.req.param('id')}`)
})

export default app
