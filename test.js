const resolve = require('./src/resolve')

resolve('now-examples/wordpress')
  .then(dir => {
    console.log(dir)
  })
  .catch(console.error)
