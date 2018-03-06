// Packages
const crossSpawn = require('cross-spawn')

module.exports = (command, args) => new Promise((resolve, reject) => {
  const child = crossSpawn.spawn(command, args)
  let stdout = ''

  child.stdout.on('data', data => {
    stdout += data
  })

  child.on('error', err => {
    reject(err)
  })

  child.on('close', code => {
    resolve({
      code,
      stdout
    })
  })
})
