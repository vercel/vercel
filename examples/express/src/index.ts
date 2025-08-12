import express, { Request, Response } from 'express'

const app = express()

const welcomeStrings = [
  "Hello Express!",
  "To learn more about Express on Vercel, visit https://vercel.com/docs/frameworks/express",
]

app.get('/', (req: Request, res: Response) => {
  res.send(welcomeStrings.join('\n\n'))
})

export default app
