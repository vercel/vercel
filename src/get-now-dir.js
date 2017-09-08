// Native
const { homedir } = require('os')
const path = require('path')
const { existsSync } = require('fs-extra')

// Packages
const minimist = require('minimist')

// Utilities
const error = require('./util/output/error')

const getNowDir = () => {
  const args = minimist(process.argv.slice(2), {
    string: ['global-config'],
    alias: {
      'global-config': 'Q'
    }
  })

  const customPath = args['global-config']

  if (!customPath) {
    return path.join(homedir(), '.now')
  }

  const resolved = path.resolve(customPath)

  if (!existsSync(resolved)) {
    console.error(error('The specified path to the `.now` directory doesn\'t exist!'))
    process.exit(1)
  }

  return resolved
}

module.exports = getNowDir
