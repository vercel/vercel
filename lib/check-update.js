// Packages
const ms = require('ms')
const fetch = require('node-fetch')
const chalk = require('chalk')
const compare = require('semver-compare')

// Ours
const pkg = require('../package')

const isTTY = process.stdout.isTTY

// if we're not in a tty the update checker
// will always return a resolved promise
const resolvedPromise = new Promise(resolve => resolve())

/**
 * Configures auto updates.
 * Sets up a `exit` listener to report them.
 */

function checkUpdate(opts = {}) {
  if (!isTTY) {
    // don't attempt to check for updates
    // if the user is piping or redirecting
    return resolvedPromise
  }

  let updateData

  const update = check(opts).then(data => {
    updateData = data

    // forces the `exit` event upon Ctrl + C
    process.on('SIGINT', () => {
      // clean up output after ^C
      process.stdout.write('\n')
      process.exit(1)
    })
  }, err => console.error(err.stack))

  process.on('exit', () => {
    if (updateData) {
      const {current, latest, at} = updateData
      const ago = ms(Date.now() - at)
      console.log(`> ${chalk.white.bgRed('UPDATE NEEDED')} ` +
        `Current: ${current} – ` +
        `Latest ${chalk.bold(latest)} (released ${ago} ago)`)
      console.log('> Run `npm install -g now` to update')
    }
  })

  return update
}

function check({debug = false}) {
  return new Promise(resolve => {
    if (debug) {
      console.log('> [debug] Checking for updates.')
    }

    fetch('https://registry.npmjs.org/now').then(res => {
      if (res.status !== 200) {
        if (debug) {
          console.log(`> [debug] Update check error. NPM ${res.status}.`)
        }

        resolve(false)
        return
      }

      res.json().then(data => {
        const {latest} = data['dist-tags']
        const current = pkg.version

        if (compare(latest, pkg.version) === 1) {
          if (debug) {
            console.log(`> [debug] Needs update. Current ${current}, latest ${latest}`)
          }

          resolve({
            latest,
            current,
            at: new Date(data.time[latest])
          })
        } else {
          if (debug) {
            console.log(`> [debug] Up to date (${pkg.version}).`)
          }

          resolve(false)
        }
      }, () => resolve(false))
    }, () => resolve(false))
  })
}

module.exports = checkUpdate
