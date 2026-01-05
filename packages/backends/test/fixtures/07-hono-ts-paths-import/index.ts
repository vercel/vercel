import { Hono } from 'hono'
import { echo } from '@/echo'
import { getVercelOidcTokenSync } from '@vercel/functions/oidc'

if(typeof getVercelOidcTokenSync !== 'function') {
  throw new Error('getVercelOidcTokenSync is not a function')
}

const app = new Hono()

const welcomeStrings = [
  "Hello Hono!",
  "To learn more about Hono on Vercel, visit https://vercel.com/docs/frameworks/backend/hono",
]

app.get('/', (c) => {
  const oidcToken = getVercelOidcTokenSync();
  return c.text(welcomeStrings.join('\n\n') + `\n\nOIDC Token: ${oidcToken}`)
})

app.get('/echo', (c) => {
  return c.text(echo('Hello World'))
})

app.get('/user/:id', (c) => {
  return c.text(`User ID: ${c.req.param('id')}`)
})

app.get('/api/data', (c) => {
  return c.json({ message: 'Hello API!' })
})

export default app
