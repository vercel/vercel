import { Hono } from 'hono'

const app = new Hono()

export const config ={
  maxDuration: 90
}

const welcomeStrings = [
  "Hello Hono!",
  "To learn more about Hono on Vercel, visit https://vercel.com/docs/frameworks/backend/hono",
]

app.get('/', (c) => {
  return c.text(welcomeStrings.join('\n\n'))
})

app.get('/user/:id', (c) => {
  return c.text(`User ID: ${c.req.param('id')}`)
})

app.get('/api/data', (c) => {
  return c.json({ message: 'Hello API!' })
})

export default app
