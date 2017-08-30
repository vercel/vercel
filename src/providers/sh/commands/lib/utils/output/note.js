const chalk = require('chalk')

// Prints a note
module.exports = msg => {
  console.log(`${chalk.yellow('> NOTE:')} ${msg}`)
}
