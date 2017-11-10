// node
const { parse: parseUrl } = require('url')
const { encode: encodeQuery, stringify: formUrlEncode } = require('querystring')
const { createServer } = require('http')

// theirs
const opn = require('opn')
const fetch = require('node-fetch')
const debug = require('debug')('now:gcp:login')

// ours
const error = require('../../util/output/error')
const aborted = require('../../util/output/aborted')
const info = require('../../util/output/info')
const cmd = require('../../util/output/cmd')
const link = require('../../util/output/link')
const highlight = require('../../util/output/highlight')
const ready = require('../../util/output/ready')
const param = require('../../util/output/param')
const promptBool = require('../../util/input/prompt-bool')
const getNowDir = require('../../config/global-path')
const humanize = require('../../util/humanize-path')
const saveCredentials = require('./util/save-credentials')
const promptList = require('../../util/input/list')
const listProjects = require('./list-projects')
const { writeToAuthConfigFile } = require('../../util/config-files')

// ports that are authorized in the GCP app
const PORTS = [8085, 8086, 8087, 8088]
const CLIENT_ID =
  '258013614557-0qulvq65vqk8pi9akn7igqsquejjffil.apps.googleusercontent.com'
const CLIENT_SECRET = 'SvmeeRFmKQkIe_ZQHSe1UJ-O'
// instructs gcp to send the response in the query string
const RESPONSE_TYPE = 'code'
const SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/appengine.admin',
  'https://www.googleapis.com/auth/compute',
  'https://www.googleapis.com/auth/accounts.reauth'
]
// instructs gcp to return a `refresh_token` that we'll use to seamlessly
// get a new auth token every time the current one expires
const ACCESS_TYPE = 'offline'
// url we'll send the user to
const USER_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
// url we'll get the access tokens from and refresh the token when needed
const TOKEN_URL = 'https://www.googleapis.com/oauth2/v4/token'
// required by oauth2's spec
const GRANT_TYPE = 'authorization_code'
// this ensures google *always* asks the user for permission
// we enfore this to make sure we *always* receive a `refresh_token` (if the
// is already authorized by the user, a `refresh_token` will *not*
// be returned) since we need it
const PROMPT_CONSENT = 'consent'

const serverListen = ({ server, port }) => {
  return new Promise((resolve, reject) => {
    server.on('error', reject) // will happen if the port is already in use
    server.listen(port, resolve)
  })
}

const login = ctx => new Promise(async resolve => {
  let credentialsIndex = ctx.authConfig.credentials.findIndex(
    cred => cred.provider === 'gcp'
  )

  if (credentialsIndex !== -1) {
    // the user is already logged into gcp
    let yes
    try {
      yes = await promptBool(
        info(
          `You already have GCP credentials – this will replace them.`,
          `  Do you want to continue?`
        )
      )
    } catch (err) {
      // promptBool only `reject`s upon user abort
      // let's set it to false just to make it clear
      yes = false
    }

    if (!yes) {
      console.log(aborted('No changes made.'))
      return
    }
  }

  const ports = [...PORTS]
  const server = createServer(async function handleRequest(req, res) {
    const { query: { error: _error, code } } = parseUrl(req.url, true)

    if (!_error && !code) {
      // the browser requesting the favicon etc
      res.end('')
      return
    }

    res.setHeader('content-type', 'text/html')
    res.end(
      `<meta charset="UTF-8">` +
        `<h2>That's it – you can now return to your terminal!</h2>`
    )

    if (_error) {
      // the user didn't give us permission
      console.log(aborted(`No changes made.`))
      return
    }

    if (code) {
      // that's right after the user gave us permission
      // let's exchange the authorization code for an access + refresh codes

      const body = formUrlEncode({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: `http://${req.headers.host}`,
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

      let accessToken
      let expiresIn
      let refreshToken
      let response

      try {
        response = await fetch(TOKEN_URL, opts)
        if (response.status !== 200) {
          debug(
            `HTTP ${response.status} when trying to exchange the authorization code`,
            await response.text()
          )
          console.log(
            error(
              `Got unexpected status code from Google: ${response.status}`
            )
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
        accessToken = json.access_token
        expiresIn = json.expires_in
        refreshToken = json.refresh_token
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
      const expiresAt = now.setSeconds(now.getSeconds() + expiresIn)
      ctx = saveCredentials({
        ctx,
        accessToken,
        expiresAt,
        refreshToken,
        credentialsIndex
      })

      const projects = await listProjects(ctx)
      const message = 'Select a project:'
      const choices = projects.map(project => {
        return {
          name: `${project.name} (${project.projectId})`,
          value: project.projectId,
          short: project.name
        }
      })

      const projectId = await promptList({
        message,
        choices,
        separator: false
      })

      const { projectId: id, name } = projects.find(
        p => p.projectId === projectId
      )

      credentialsIndex = ctx.authConfig.credentials.findIndex(
        cred => cred.provider === 'gcp'
      )
      ctx.authConfig.credentials[credentialsIndex].project = {
        id,
        name
      }

      writeToAuthConfigFile(ctx.authConfig)

      console.log(
        ready(
          `Credentials and project saved in ${param(humanize(getNowDir()))}.`
        )
      )
    }

    resolve()
  })

  let shouldRetry = true
  let portToTry = ports.shift()

  while (shouldRetry) {
    try {
      await serverListen({ server, port: portToTry })
      shouldRetry = false // done, listening
    } catch (err) {
      if (ports.length) {
        // let's try again
        portToTry = ports.shift()
      } else {
        // we're out of ports to try
        shouldRetry = false
      }
    }
  }

  if (!server.listening) {
    console.log(
      error(
        `Make sure you have one of the following TCP ports available:`,
        `  ${PORTS.join(', ').replace()}`
      )
    )
    return
  }

  const query = {
    client_id: CLIENT_ID,
    redirect_uri: `http://localhost:${portToTry}`,
    response_type: RESPONSE_TYPE,
    scope: SCOPES.join(' '),
    access_type: ACCESS_TYPE,
    prompt: PROMPT_CONSENT
  }

  if(process.platform === "darwin" || process.platform === "win32") {
    opn(USER_URL + '?' + encodeQuery(query))
    console.log(info('A Google Accounts login window has been opened in your default browser. Please log in there and check back here afterwards.'));
  } else {
    console.log(info(
      `We'll need you to grant us access to provision functions on your ${highlight('Google Cloud Platform')} account in order to comunicate with their API.`,
      `To provision a dedicated set of tokens for ${cmd('now')}, Go to ${link(USER_URL + '?' + encodeQuery(query))} and grant access to Now.`
    ))
  }
})

module.exports = login
