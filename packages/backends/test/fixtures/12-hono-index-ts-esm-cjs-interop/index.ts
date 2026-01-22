import { Hono } from 'hono'
import { sign } from 'jsonwebtoken'
// import pkg from 'jsonwebtoken'
// const { sign } = pkg

const token = sign({ foo: 'bar' }, 'secret')
console.log({ token })

const app = new Hono()

app.get('/', (c) => {
  return c.text('Hello World')
})

export default app
