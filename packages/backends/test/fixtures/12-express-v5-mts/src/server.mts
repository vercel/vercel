import express from 'express'

const app = express()

app.use('/', (req, res) => {
  res.send('Hello, world!')
})

app.get('/users/:id', (req, res) => {
  res.send(`User ${req.params.id}`)
})

export default app
