const deploy = require('./latest')
const deployLegacy = require('./legacy')
const getContextName = require('../../util/get-context-name')
const createOutput = require('../../util/output')
const code = require('../../util/output/code')
const highlight = require('../../util/output/highlight')

module.exports = async (ctx) => {
  let platformVersion = null
  let contextName = null

  const {authConfig, config: {currentTeam, version}, apiUrl} = ctx
  const output = createOutput({ debug: false })

  if (authConfig && authConfig.token) {
    ;({ contextName, platformVersion } = await getContextName({
      apiUrl,
      token: authConfig.token,
      debug: false,
      currentTeam,
      includePlatformVersion: true
    }))
  }

  if (version) {
    if (typeof version === 'number') {
      if (version !== 1 && version !== 2) {
        const prop = code('version')
        const file = highlight('now.json')

        output.error(`The value of the ${prop} property inside ${file} can only be ${code(1)} or ${code(2)}.`)
        return 1
      }

      platformVersion = version
    } else {
      const prop = code('version')
      const file = highlight('now.json')

      output.error(`The ${prop} property inside your ${file} file must be a number.`)
      return 1
    }
  } else {
    const prop = code('version')
    const file = highlight('now.json')
    const fallback = highlight(platformVersion === null ? 'latest version' : `version ${platformVersion}`)

    output.warn(`Your ${file} file is missing the ${prop} property. Falling back to ${fallback}.`)
  }

  if (platformVersion === null || platformVersion > 1) {
    return deploy(ctx, contextName)
  }

  return deployLegacy(ctx, contextName)
}
