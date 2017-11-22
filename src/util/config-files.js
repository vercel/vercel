// Native
const { join: joinPath } = require('path')

// Packages
const loadJSON = require('load-json-file')
const writeJSON = require('write-json-file')

// Utilities
const getNowDir = require('../config/global-path')

const NOW_DIR = getNowDir()
const CONFIG_FILE_PATH = joinPath(NOW_DIR, 'config.json')
const AUTH_CONFIG_FILE_PATH = joinPath(NOW_DIR, 'auth.json')

// reads `CONFIG_FILE_PATH` atomically
const readConfigFile = () => loadJSON.sync(CONFIG_FILE_PATH)

// writes whatever's in `stuff` to `CONFIG_FILE_PATH`, atomically
const writeToConfigFile = stuff =>
  writeJSON.sync(CONFIG_FILE_PATH, stuff, { indent : 2 })

// reads `AUTH_CONFIG_FILE_PATH` atomically
const readAuthConfigFile = () => loadJSON.sync(AUTH_CONFIG_FILE_PATH)

// writes whatever's in `stuff` to `AUTH_CONFIG_FILE_PATH`, atomically
const writeToAuthConfigFile = stuff =>
  writeJSON.sync(AUTH_CONFIG_FILE_PATH, stuff, { indent : 2, mode : 0o600 })

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
