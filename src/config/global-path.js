// Native
const { homedir } = require('os')
const path = require('path')

// Packages
const minimist = require('minimist')

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

  return path.resolve(customPath)
}

module.exports = getNowDir
