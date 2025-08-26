import express from 'express'

const app = express()

const welcomeStrings = [
  "Hello Express!",
  "To learn more about Express on Vercel, visit https://vercel.com/docs/frameworks/backend/express",
]

app.get('/', (_req, res) => {
  res.send(welcomeStrings.join('\n\n'))
})

export default app
