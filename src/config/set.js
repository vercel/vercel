const debug = require('debug')('now:config:set')
const error = require('../util/output/error')
const success = require('../util/output/success')
const param = require('../util/output/param')
const hp = require('../util/humanize-path')
const { writeToConfigFile, getConfigFilePath } = require('../util/config-files')

const CONFIGS = new Map([
  [
    'defaultProvider',
    value => {
      const providers = require('../providers')
      return [providers.hasOwnProperty(value), value]
    }
  ],
  [
    'includeScheme',
    value => {
      const isValid = ['true', 'false', true, false].includes(value)
      return [isValid, value === 'true' || value === true]
    }
  ]
])

module.exports = function set(ctx) {
  const [name, value] = ctx.argv.slice(4)

  debug('setting config %s to %s', name, value)

  if (!CONFIGS.has(name)) {
    console.error(error(`Unexpected config name: ${name}`))
    return 1
  }

  const validate = CONFIGS.get(name)
  const [isValid, finalValue] = validate(value);
  if (!isValid) {
    console.error(error(`Unexpected config value for ${name}: ${value}`))
    return 1
  }

  ctx.config[name] = finalValue
  writeToConfigFile(ctx.config)

  console.log(success(`Config saved in ${param(hp(getConfigFilePath()))}`))
}
