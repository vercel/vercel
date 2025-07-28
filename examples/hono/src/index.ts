import { Hono } from 'hono'

const app = new Hono()

const welcomeStrings = [
  "Hello Hono!",
  "To learn more about Hono on Vercel, visit https://vercel.com/docs/frameworks/hono",
]

app.get('/', (c) => {
  return c.text(welcomeStrings.join('\n\n'))
})

export default app
