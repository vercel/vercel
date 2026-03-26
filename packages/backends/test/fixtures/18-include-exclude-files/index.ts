import { Hono } from 'hono'
import { readFileSync } from 'fs'
import { join } from 'path'

const app = new Hono()

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.get('/template', (c) => {
  const template = readFileSync(join(process.cwd(), 'templates', 'hello.art'), 'utf-8')
  return c.text(template)
})

export default app
