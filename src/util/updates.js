// Packages
const updateNotifier = require('update-notifier')
const chalk = require('chalk')

// Utilities
const pkg = require('./pkg')

module.exports = () => {
  const { update } = updateNotifier({ pkg })

  if (!update) {
    return
  }

  console.log(`${chalk.white.bold.bgRed('UPDATE AVAILABLE')} The latest version of Now CLI is ${chalk.bold(update.latest)}`)
}
