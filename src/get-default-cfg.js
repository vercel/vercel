// Native
const { join } = require('path')
const { homedir } = require('os')

// Packages
const readJSON = require('load-json-file')

module.exports = async () => {
  let migrated = false

  const config = {
    _: 'This is your Now config file. See `now config help`. More: https://git.io/v5ECz'
  }

  try {
    const sh = await readJSON(join(homedir(), '.now.json'))

    delete sh.lastUpdate
    delete sh.token

    Object.assign(config, { sh })
    migrated = true
  } catch (err) {}

  return {config, migrated}
}
