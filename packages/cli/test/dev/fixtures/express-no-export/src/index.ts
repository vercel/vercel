import express from 'express'

const app = express()

app.get('/', (_req, res) => {
  res.json({
    message: 'Hello Express!',
  })
})

// the port and console.log will not be executed because we stub the listen method
// before importing the module
app.listen(3000, () => {
  console.log('Server is running on port 3000')
})
