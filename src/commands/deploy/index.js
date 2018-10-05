const deploy = require('./latest')
const deployLegacy = require('./legacy')
const getContextName = require('../../util/get-context-name')

module.exports = async (ctx) => {
  const { authConfig: {token}, config, apiUrl } = ctx
  const { currentTeam } = config

  const { contextName, platformVersion } = await getContextName({
    apiUrl,
    token,
    debug: false,
    currentTeam,
    includePlatformVersion: true
  })

  if (platformVersion === null || platformVersion > 1) {
    return deploy(ctx, contextName)
  }

  return deployLegacy(ctx, contextName)
}
