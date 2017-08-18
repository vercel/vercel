// node
const { stringify: formUrlEncode } = require('querystring')

// theirs
const fetch = require('node-fetch')
const debug = require('debug')('now:gcp:get_token')

// ours
const saveCredentials = require('./save-credentials')
const error = require('../../../util/output/error')
const cmd = require('../../../util/output/cmd')

const CLIENT_ID =
  '258013614557-0qulvq65vqk8pi9akn7igqsquejjffil.apps.googleusercontent.com'
const CLIENT_SECRET = 'SvmeeRFmKQkIe_ZQHSe1UJ-O'
// required by oauth2's spec
const GRANT_TYPE = 'refresh_token'
const URL = 'https://www.googleapis.com/oauth2/v4/token'

// note that this function treats the errors it can produce, printing them
// to the user and then returns `undefined`
const getAccessToken = async ctx => {
  const credentialsIndex = ctx.authConfig.credentials.findIndex(
    c => c.provider === 'gcp'
  )

  if (credentialsIndex === -1) {
    console.log(error(`You're not logged in! Run ${cmd('now gcp login')}.`))
    process.exit(1)

    return
  }

  const { accessToken, expiresAt, refreshToken } = ctx.authConfig.credentials[
    credentialsIndex
  ]

  if (Date.now() < expiresAt) {
    // the token is still valid
    return accessToken
  }
  // we need to refresh the token
  const body = formUrlEncode({
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: GRANT_TYPE
  })

  const opts = {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'content-length': body.length // just in case
    },
    body: body
  }

  let newAccessToken
  let newExpiresIn
  let response

  try {
    response = await fetch(URL, opts)
    if (response.status !== 200) {
      debug(
        `HTTP ${response.status} when trying to exchange the authorization code`,
        await response.text()
      )
      console.log(
        error(`Got unexpected status code from Google: ${response.status}`)
      )
      return
    }
  } catch (err) {
    debug(
      'unexpected error occurred while making the request to exchange the authorization code',
      err.message
    )
    console.log(
      error(
        'Unexpected error occurred while authenthing with Google',
        err.stack
      )
    )
    return
  }

  try {
    const json = await response.json()
    newAccessToken = json.access_token
    newExpiresIn = json.expires_in
  } catch (err) {
    debug(
      'unexpected error occurred while parsing the JSON from the exchange request',
      err.stack,
      'got',
      await response.text()
    )
    console.log(
      error(
        'Unexpected error occurred while parsing the JSON response from Google',
        err.message
      )
    )
    return
  }

  const now = new Date()
  // `expires_in` is 3600 seconds
  const newExpiresAt = now.setSeconds(now.getSeconds() + newExpiresIn)
  saveCredentials({
    ctx,
    accessToken: newAccessToken,
    expiresAt: newExpiresAt,
    refreshToken,
    credentialsIndex
  })

  return newAccessToken
}

module.exports = getAccessToken
