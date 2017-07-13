require('http')
  .createServer((req, res) => {
    res.end('Hello world!')
  })
  .listen(process.env.PORT)
