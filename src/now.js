#!/usr/bin/env node
//@flow

// Native
const { join, basename } = require('path')

// Packages
const debug = require('debug')('now:main')
const { existsSync } = require('fs-extra')
const mkdirp = require('mkdirp-promise')
const mri = require('mri')
const chalk = require('chalk')

// Utilities
const error = require('./util/output/error')
const param = require('./util/output/param')
const info = require('./util/output/info')
const getNowDir = require('./get-now-dir')
const getDefaultCfg = require('./get-default-cfg')
const getDefaultAuthCfg = require('./get-default-auth-cfg')
const hp = require('./util/humanize-path')
const providers = require('./providers')
const configFiles = require('./util/config-files')
const checkForUpdates = require('./util/updates')

const NOW_DIR = getNowDir()
const NOW_CONFIG_PATH = configFiles.getConfigFilePath()
const NOW_AUTH_CONFIG_PATH = configFiles.getAuthConfigFilePath()

const GLOBAL_COMMANDS = new Set(['help'])

const main = async (argv_) => {
  await checkForUpdates()

  const argv = mri(argv_, {
    boolean: ['help', 'version'],
    alias: {
      help: 'h',
      version: 'v'
    }
  })

  // the second argument to the command can be a path
  // (as in: `now path/`) or a subcommand / provider
  // (as in: `now ls` or `now aws help`)
  let targetOrSubcommand: ?string = argv._[2]

  // we want to handle version or help directly only
  if (!targetOrSubcommand) {
    if (argv.version) {
      console.log(require('../package').version)
      return 0
    }
  }

  let nowDirExists

  try {
    nowDirExists = existsSync(NOW_DIR)
  } catch (err) {
    console.error(
      error(
        'An unexpected error occurred while trying to find the ' +
          'now global directory: ' +
          err.message
      )
    )
    return
  }

  if (!nowDirExists) {
    try {
      await mkdirp(NOW_DIR)
    } catch (err) {
      error(
        'An unexpected error occurred while trying to create the ' +
          `now global directory "${hp(NOW_DIR)}" ` +
          err.message
      )
    }
  }

  let migrated = false
  let configExists

  try {
    configExists = existsSync(NOW_CONFIG_PATH)
  } catch (err) {
    console.error(
      error(
        'An unexpected error occurred while trying to find the ' +
          `now config file "${hp(NOW_CONFIG_PATH)}" ` +
          err.message
      )
    )
    return
  }

  let config

  if (configExists) {
    try {
      config = configFiles.readConfigFile()
    } catch (err) {
      console.error(
        error(
          'An unexpected error occurred while trying to read the ' +
            `now config in "${hp(NOW_CONFIG_PATH)}" ` +
            err.message
        )
      )
      return
    }

    try {
      config = JSON.parse(config)
    } catch (err) {
      console.error(
        error(
          `An error occurred while trying to parse "${hp(NOW_CONFIG_PATH)}": ` +
            err.message
        )
      )
      return
    }
  } else {
    const results = await getDefaultCfg()

    config = results.config
    migrated = results.migrated

    try {
      configFiles.writeToConfigFile(config)
    } catch (err) {
      console.error(
        error(
          'An unexpected error occurred while trying to write the ' +
            `default now config to "${hp(NOW_CONFIG_PATH)}" ` +
            err.message
        )
      )
      return
    }
  }

  let authConfigExists

  try {
    authConfigExists = existsSync(NOW_AUTH_CONFIG_PATH)
  } catch (err) {
    console.error(
      error(
        'An unexpected error occurred while trying to find the ' +
          `now auth file "${hp(NOW_AUTH_CONFIG_PATH)}" ` +
          err.message
      )
    )
    return
  }

  let authConfig = null

  if (authConfigExists) {
    try {
      authConfig = configFiles.readAuthConfigFile()
    } catch (err) {
      console.error(
        error(
          'An unexpected error occurred while trying to read the ' +
            `now auth config in "${hp(NOW_AUTH_CONFIG_PATH)}" ` +
            err.message
        )
      )
      return
    }

    try {
      authConfig = JSON.parse(authConfig)

      if (!Array.isArray(authConfig.credentials)) {
        console.error(
          error(
            `The content of "${hp(NOW_AUTH_CONFIG_PATH)}" is invalid. ` +
              'No `credentials` list found inside'
          )
        )
        return
      }

      for (const [i, { provider }] of authConfig.credentials.entries()) {
        if (null == provider) {
          console.error(
            error(
              `Invalid credential found in "${hp(NOW_AUTH_CONFIG_PATH)}". ` +
                `Missing \`provider\` key in entry with index ${i}`
            )
          )
          return
        }

        if (!(provider in providers)) {
          console.error(
            error(
              `Invalid credential found in "${hp(NOW_AUTH_CONFIG_PATH)}". ` +
                `Unknown provider "${provider}"`
            )
          )
          return
        }
      }
    } catch (err) {
      console.error(
        error(
          `An error occurred while trying to parse "${hp(
            NOW_AUTH_CONFIG_PATH
          )}": ` + err.message
        )
      )
      return
    }
  } else {
    const results = await getDefaultAuthCfg()

    authConfig = results.config
    migrated = results.migrated

    try {
      configFiles.writeToAuthConfigFile(authConfig)
    } catch (err) {
      console.error(
        error(
          'An unexpected error occurred while trying to write the ' +
            `default now config to "${hp(NOW_CONFIG_PATH)}" ` +
            err.message
        )
      )
      return
    }
  }

  // Let the user know we migrated the config
  if (migrated) {
    const directory = chalk.grey(join('~', basename(NOW_DIR)))
    console.log(info(`Your credentials and configuration were migrated to ${directory}`))
  }

  // the context object to supply to the providers or the commands
  const ctx = {
    config,
    authConfig,
    argv: argv_
  }

  if (targetOrSubcommand === 'config') {
    const _config = require('./config')
    const subcommand = _config.subcommands.has(argv._[3]) ? argv._[3] : 'help'

    debug(`executing config %s`, subcommand)

    try {
      return _config[subcommand](ctx)
    } catch (err) {
      console.error(
        error(
          `An unexpected error occurred in config ${subcommand}: ${err.stack}`
        )
      )
      return
    }
  }

  let suppliedProvider = null

  // if the target is something like `aws`
  if (targetOrSubcommand && targetOrSubcommand in providers) {
    debug('user supplied a known provider')
    const targetPath = join(process.cwd(), targetOrSubcommand)
    const targetPathExists = existsSync(targetPath)

    if (targetPathExists) {
      console.error(
        error(
          `The supplied argument ${param(targetOrSubcommand)} is ambiguous. ` +
            'Both a directory and a provider are known'
        )
      )
      return
    }

    suppliedProvider = targetOrSubcommand
    targetOrSubcommand = argv._[3]
  }

  // $FlowFixMe
  let { defaultProvider = null }: { defaultProvider: ?string } = config

  if (null === suppliedProvider) {
    if (null === defaultProvider) {
      // the first provider the user ever logged in to is
      // the default provider
      if (authConfig && authConfig.credentials.length) {
        debug('using first credential as default provider')
        defaultProvider = authConfig.credentials[0].provider
      } else {
        debug(`fallbacking to default now provider 'sh'`)
        defaultProvider = 'sh'
      }
    } else {
      debug('using provider supplied by user', defaultProvider)
      if (!(defaultProvider in providers)) {
        console.error(
          error(
            `The \`defaultProvider\` "${defaultProvider}" supplied in ` +
              `"${NOW_CONFIG_PATH}" is not a valid provider`
          )
        )
        return
      }
    }
  }

  const providerName = suppliedProvider || defaultProvider
  const provider: Object = providers[providerName]

  let subcommand

  // we check if we are deploying something
  if (targetOrSubcommand) {
    const targetPath = join(process.cwd(), targetOrSubcommand)
    const targetPathExists = existsSync(targetPath)

    const subcommandExists =
      GLOBAL_COMMANDS.has(targetOrSubcommand) ||
      provider.subcommands.has(targetOrSubcommand)

    if (targetPathExists && subcommandExists) {
      console.error(
        error(
          `The supplied argument ${param(targetOrSubcommand)} is ambiguous. ` +
            'Both a directory and a subcommand are known'
        )
      )
      return
    }

    if (subcommandExists) {
      debug('user supplied known subcommand', targetOrSubcommand)
      subcommand = targetOrSubcommand
    } else {
      debug('user supplied a possible target for deployment')
      // our default command is deployment
      // at this point we're
      subcommand = 'deploy'
    }
  } else {
    debug('user supplied no target, defaulting to deploy')
    subcommand = 'deploy'
  }

  if (subcommand === 'help') {
    subcommand = argv._[3] || 'deploy'
    ctx.argv.push('-h')
  }

  // If no credentials are set at all, prompt for
  // login to the .sh provider
  if (!authConfig.credentials.length && !ctx.argv.includes('-h')) {
    console.log(info(`No existing credentials found. Please log in:`))

    subcommand = 'login'
    ctx.argv[2] = 'login'

    // Ensure that sub commands lead to login as well, if
    // no credentials are defined
    ctx.argv = ctx.argv.splice(0, 3)
  }

  try {
    await provider[subcommand](ctx)
  } catch (err) {
    console.error(
      error(
        `An unexpected error occurred in provider ${subcommand}: ${err.stack}`
      )
    )
  }

  if (providerName === 'gcp') {
    process.exit()
  }
}

debug('start')

const handleRejection = err => {
  debug('handling rejection')
  if (err) {
    if (err instanceof Error) {
      handleUnexpected(err)
    } else {
      console.error(error(`An unexpected rejection occurred\n  ${err}`))
    }
  } else {
    console.error(error('An unexpected empty rejection occurred'))
  }
  process.exit(1)
}

const handleUnexpected = err => {
  debug('handling unexpected error')
  console.error(
    error(`An unexpected error occurred!\n  ${err.stack} ${err.stack}`)
  )
  process.exit(1)
}

process.on('unhandledRejection', handleRejection)
process.on('uncaughtException', handleUnexpected)

// Don't use `.then` here. We need to shutdown gracefully, otherwise
// sub commands waiting for further data won't work (like `logs` and `logout`)!
main(process.argv).catch(handleUnexpected)
