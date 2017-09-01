const { writeToAuthConfigFile } = require('../../../util/config-files')

const saveCredentials = ({
  ctx,
  accessToken,
  expiresAt,
  refreshToken,
  credentialsIndex
}) => {
  const current = ctx.authConfig.credentials[credentialsIndex] || {}
  const obj = Object.assign({}, current, {
    provider: 'gcp',
    accessToken,
    expiresAt,
    refreshToken
  })

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

module.exports = saveCredentials
