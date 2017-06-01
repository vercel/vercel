// Native
const { homedir } = require('os')
const path = require('path')

// Packages
const fs = require('fs-extra')
const ms = require('ms')

// Ours
const { get: getUser } = require('./user')

// `8h` is arbitrarily used based on the average sleep time
const TTL = ms('8h')

let file = process.env.NOW_JSON
  ? path.resolve(process.env.NOW_JSON)
  : path.resolve(homedir(), '.now.json')

function setConfigFile(nowjson) {
  file = path.resolve(nowjson)
}

function save(data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
}

/**
 * Reads the config file
 *
 * Optionally, always queries the API to get the user info even if the
 * config file is not present
 *
 * @param  {Boolean} force [false] Queries the API even if the config
 *                                 file is not present. If `true`, `token`
 *                                 *must* be specified
 * @param  {String}  token         Will be used to autenticate in the API
                                   if needed
 * @param  {String}  apiUrl        URL of the API to be used
 * @return {Object}
 */
async function read({ force = false, token, apiUrl } = {}) {
  let existing = {}
  try {
    existing = fs.readFileSync(file, 'utf8')
    existing = JSON.parse(existing)
  } catch (err) {}

  // Will happen if `force`d or if `--token` is used and it's different from
  // The one that's stored (which can be `undefined`)
  if ((force && token) || (token && token !== existing.token)) {
    const user = await getUser({ token, apiUrl })
    if (user) {
      return {
        token,
        user: {
          uid: user.uid,
          username: user.username,
          email: user.email
        },
        currentTeam: existing.currentTeam
      }
    }
    return {}
  }

  if (!existing.token) {
    return {}
  }

  if (!existing.lastUpdate || Date.now() - existing.lastUpdate > TTL) {
    // TODO: update `teams` info
    const token = existing.token
    const user = await getUser({ token })

    if (user) {
      existing.user = user
      existing.lastUpdate = Date.now()
      save(existing)
    }
  }
  return existing
}

/**
 * Merges the `data` object onto the
 * JSON config stored in `.now.json`.
 *
 * (atomic)
 * @param {Object} data
 */
async function merge(data) {
  const cfg = Object.assign({}, await read(), data)
  save(cfg)
}

// Removes a key from the config and store the result
async function remove(key) {
  const cfg = await read()
  delete cfg[key]
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2))
}

// We need to remove the config file when running `now logout`
const removeFile = async () => fs.remove(file)

module.exports = {
  setConfigFile,
  read,
  merge,
  remove,
  removeFile
}
