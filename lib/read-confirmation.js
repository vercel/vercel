const chalk = require('chalk')

module.exports = async function (message) {
  return new Promise(resolve => {
    process.stdout.write(message)
    process.stdout.write(`  ${chalk.bold.red('> Are you sure?')} ${chalk.gray('[y/N] ')}`)

    process.stdin.on('data', d => {
      process.stdin.pause()
      resolve(d.toString().trim())
    }).resume()
  })
}

