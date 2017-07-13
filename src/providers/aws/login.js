// @flow
// theirs
const { green, italic } = require('chalk')

// ours
const info = require('../../util/output/info')
const note = require('../../util/output/note')
const aborted = require('../../util/output/aborted')
const cmd = require('../../util/output/cmd')
const param = require('../../util/output/param')
const ready = require('../../util/output/ready')
const highlight = require('../../util/output/highlight')
const listItem = require('../../util/output/list-item')
const link = require('../../util/output/link')
const textInput = require('../../util/input/text')
const eraseLines = require('../../util/output/erase-lines')
const chars = require('../../util/output/chars')
const {
  hasExternalCredentials,
  getExternalCredentials,
  AWS_CREDENTIALS_FILE_PATH
} = require('./util/external-credentials')
const promptBool = require('../../util/input/prompt-bool')
const {
  writeToAuthConfigFile,
  getAuthConfigFilePath
} = require('../../util/config-files')
const humanize = require('../../util/humanize-path')

const accessKeyIdLabel = 'Access Key ID      '
const secretAccessKeyLabel = 'Secret Access Key  '

function saveCredentials({
  ctx,
  accessKeyId,
  secretAccessKey,
  useExternal,
  credentialsIndex
}) {
  const obj = {
    provider: 'aws'
  }

  if (useExternal) {
    obj.useVendorConfig = true
  } else {
    obj.accessKeyId = accessKeyId
    obj.secretAccessKey = secretAccessKey
  }

  if (credentialsIndex === -1) {
    // the user is not logged in
    ctx.authConfig.credentials.push(obj)
  } else {
    // the user is already logged in - let's replace the credentials we have
    ctx.authConfig.credentials[credentialsIndex] = obj
  }

  writeToAuthConfigFile(ctx.authConfig)

  return ctx
}

async function login(ctx) {
  const credentialsIndex = ctx.authConfig.credentials.findIndex(
    cred => cred.provider === 'aws'
  )

  if (credentialsIndex !== -1) {
    // the user is already logged in on aws
    console.log(
      note(`You already have AWS credentials – this will replace them.`)
    )
  }

  if (await hasExternalCredentials()) {
    // if the user has ~/.aws/credentials, let's ask if they want to use them
    const credentials = await getExternalCredentials()

    if (credentials.accessKeyId && credentials.secretAccessKey) {
      let yes
      try {
        yes = await promptBool(
          info(
            `AWS credentials found in ${param(AWS_CREDENTIALS_FILE_PATH)}.`,
            `  Would you like to use them?`
          ),
          {
            defaultValue: true
          }
        )
      } catch (err) {
        if (err.code === 'USER_ABORT') {
          console.log(aborted('No changes made.'))
          return 1
        }
        throw err
      }

      if (yes) {
        ctx = saveCredentials({ ctx, useExternal: true, credentialsIndex })
        console.log(
          ready(`Credentials will be read from your AWS config when needed`)
        )
        return
      } else {
        console.log(info(`Ignoring ${param(AWS_CREDENTIALS_FILE_PATH)}`))
      }
    }
  }

  // prettier-ignore
  console.log(info(
    `We'll need your ${highlight('AWS credentials')} in order to comunicate with their API.`,
    `  To provision a dedicated set of tokens for ${cmd('now')}, do the following:`,
    ``,
    `  ${listItem(1, `Go to ${link('https://console.aws.amazon.com/iam')}`)}`,
    `  ${listItem(2, `Click on ${param('Users')} in the left menubar`)}`,
    `  ${listItem(3, `Click on ${param('Add user')}`)}`,
    `  ${listItem(4, `Give your user a name and select ${param('Programmatic access')}`)}`,
    `  ${listItem(5, `In the ${param('Permissions')} step, select\n` +
    `     ${param('Attach existing policies directly')}\n` +
    `     and then\n` +
    `     ${param('AdministratorAccess')}`)} ${italic('(or pick your own)')}`,
    `  ${listItem(6, `After the ${param('Review')} step, grab your keys and paste them below:`)}`,
    ``
  ))

  try {
    const accessKeyId = await textInput({ label: listItem(accessKeyIdLabel) })
    console.log(
      `${eraseLines(1)}${green(chars.tick)} ${accessKeyIdLabel}${accessKeyId}`
    )

    const secretAccessKey = await textInput({
      label: listItem(secretAccessKeyLabel)
    })
    console.log(
      `${eraseLines(1)}${green(
        chars.tick
      )} ${secretAccessKeyLabel}${secretAccessKey}`
    )

    ctx = saveCredentials({
      ctx,
      accessKeyId,
      secretAccessKey,
      credentialsIndex
    })
    console.log(
      ready(`Credentials saved in ${param(humanize(getAuthConfigFilePath()))}`)
    )
  } catch (err) {
    if (err.code === 'USER_ABORT') {
      console.log(aborted('No changes made.'))
      return 1
    }
    throw err
  }
}

module.exports = login
