const deploy = require('./deploy')
const deployLegacy = require('./deploy-legacy')
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

  if (platformVersion === null) {
    return deploy(ctx, contextName)
  }

  return deployLegacy(ctx, contextName)
}
