// Native
const { join } = require('path')
const { homedir } = require('os')

// Packages
const readJSON = require('load-json-file')

module.exports = async () => {
  let migrated = false

  const config = {
    _: 'This is your Now credentials file. DON\'T SHARE! More: https://git.io/v5ECz',
    credentials: []
  }

  try {
    const {token} = await readJSON(join(homedir(), '.now.json'))

    config.credentials.push({
      provider: 'sh',
      token
    })

    migrated = true
  } catch (err) {}

  return {config, migrated}
}
