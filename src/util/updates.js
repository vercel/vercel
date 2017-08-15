// Packages
const updateNotifier = require('update-notifier')
const chalk = require('chalk')

// Utilities
const pkg = require('./pkg')

module.exports = () => {
  if (!process.pkg) {
    return
  }

  const notifier = updateNotifier({ pkg })
  const update = notifier.update

  if (!update) {
    return
  }

  let message = `Update available! ${chalk.red(
    update.current
  )} → ${chalk.green(update.latest)} \n`
  message += `${chalk.magenta(
    'Changelog:'
  )} https://github.com/zeit/now-cli/releases/tag/${update.latest}\n`

  if (pkg._npmPkg) {
    message += `Run ${chalk.magenta('npm i -g now')} to update!`
  } else {
    message += `Please download binaries from https://zeit.co/download`
  }

  notifier.notify({ message })
}
