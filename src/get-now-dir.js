const { homedir } = require('os')
const { join } = require('path')

const getNowDir = () => {
  return process.env.NOW_HOME || join(homedir(), '.now')
}

module.exports = getNowDir
