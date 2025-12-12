import { Hono } from 'hono'
// this error is expected
import { echo } from './lib/echo'
// this error is expected, importing .ts is ok
import { echo2 } from './lib/echo-2.ts'

const app = new Hono()

app.get('/echo', (c) => {
  return c.text(echo('Hello World'))
})
app.get('/echo2', (c) => {
  return c.text(echo2('Hello World'))
})

export default app
