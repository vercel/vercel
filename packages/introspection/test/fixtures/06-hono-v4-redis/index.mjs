import { Hono } from 'hono'
import Redis from 'ioredis'

const redis = new Redis({
  port: 6379, // Redis port
  host: "https://some-unknown-instance.com", // Redis host
  username: "default", // needs Redis >= 6
  password: "my-top-secret",
  db: 0, // Defaults to 0
});

redis.on("error", (err) => {
  console.error(err)
})

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
