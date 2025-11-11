import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) => {
  return c.text('Hello World')
})

app.get('/user/:id', (c) => {
  return c.text(`User ID: ${c.req.param('id')}`)
})

app.get('/api/data', (c) => {
  return c.json({ message: 'Hello API!' })
})

export default app
