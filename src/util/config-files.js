// Native
const { readFileSync, writeFileSync } = require('fs')
const { join: joinPath } = require('path')

// Utilities
const getNowDir = require('../config/global-path')

const NOW_DIR = getNowDir()
const CONFIG_FILE_PATH = joinPath(NOW_DIR, 'config.json')
const AUTH_CONFIG_FILE_PATH = joinPath(NOW_DIR, 'auth.json')

const prettify = obj => JSON.stringify(obj, null, 2)

// reads `CONFIG_FILE_PATH` atomically
const readConfigFile = () => readFileSync(CONFIG_FILE_PATH, 'utf8')

// writes whatever's in `stuff` to `CONFIG_FILE_PATH`, atomically
const writeToConfigFile = stuff =>
  writeFileSync(CONFIG_FILE_PATH, prettify(stuff))

// reads `AUTH_CONFIG_FILE_PATH` atomically
const readAuthConfigFile = () => readFileSync(AUTH_CONFIG_FILE_PATH, 'utf8')

// writes whatever's in `stuff` to `AUTH_CONFIG_FILE_PATH`, atomically
const writeToAuthConfigFile = stuff =>
  writeFileSync(AUTH_CONFIG_FILE_PATH, prettify(stuff))

function getConfigFilePath() {
  return CONFIG_FILE_PATH
}

function getAuthConfigFilePath() {
  return AUTH_CONFIG_FILE_PATH
}

module.exports = {
  readConfigFile,
  writeToConfigFile,
  readAuthConfigFile,
  writeToAuthConfigFile,
  getConfigFilePath,
  getAuthConfigFilePath
}
