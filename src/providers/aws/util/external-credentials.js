// node
const { join: joinPath } = require('path')
const { homedir } = require('os')

// theirs
const { readFile, exists: fileExists } = require('fs.promised')
const debug = require('debug')('now:aws:util:external-credentials')

const AWS_CREDENTIALS_FILE_PATH = joinPath(homedir(), '.aws', 'credentials')
// matches `aws_access_key_id=aaaaa`
// and `aws_access_key_id = aaaaa` with any number of spaces
const ACCESS_KEY_ID_REGEX = /^aws_access_key_id(\s+)?=(\s+)?(.*)$/m
const SECRET_ACCESS_KEY_REGEX = /^aws_secret_access_key(\s+)?=(\s+)?(.*)$/m

// checks if there's a ~/.aws/credentials
async function hasExternalCredentials() {
  let found = false
  try {
    found = await fileExists(AWS_CREDENTIALS_FILE_PATH)
  } catch (err) {
    // if this happens, we're fine:
    // 1. if the user is trying to login, let's just fallback to the manual
    // steps
    // 2. if it's the Nth time the user is using `now aws`, we know we depend
    // on this file and we'll let him know that we couldn't find the file
    // anymore upon `hasExternalCredentials() === false`
    debug(`Couldn't read ${AWS_CREDENTIALS_FILE_PATH} because of ${err}`)
  }

  return found
}

// gets the two aws tokens from ~/.aws/credentials
// assumes the file exist – `hasExternalCredentials` should always be called
// first
async function getExternalCredentials() {
  let contents
  try {
    contents = await readFile(AWS_CREDENTIALS_FILE_PATH, 'utf8')
  } catch (err) {
    // Here we should error because the file is there but we can't read it
    throw new Error(
      `Couldn't read ${AWS_CREDENTIALS_FILE_PATH} beause of ${err.message}`
    )
  }

  const matchesAccessKeyId = ACCESS_KEY_ID_REGEX.exec(contents)
  const matchesSecretAccessKey = SECRET_ACCESS_KEY_REGEX.exec(contents)

  return {
    accessKeyId: (matchesAccessKeyId && matchesAccessKeyId[3]) || undefined,
    secretAccessKey:
      (matchesSecretAccessKey && matchesSecretAccessKey[3]) || undefined
  }
}

module.exports = {
  hasExternalCredentials,
  getExternalCredentials,
  AWS_CREDENTIALS_FILE_PATH:
    process.platform === 'win32'
      ? AWS_CREDENTIALS_FILE_PATH
      : AWS_CREDENTIALS_FILE_PATH.replace(homedir(), '~')
}
