#!/usr/bin/env node
//@flow

// Native
const { join } = require('path')

// Packages
const debug = require('debug')('now:main')
const { existsSync } = require('fs-extra')
const mkdirp = require('mkdirp-promise')
const mri = require('mri')
const fetch = require('node-fetch')

// Utilities
const error = require('./util/output/error')
const param = require('./util/output/param')
const info = require('./util/output/info')
const getNowDir = require('./config/global-path')
const getDefaultCfg = require('./get-default-cfg')
const getDefaultAuthCfg = require('./get-default-auth-cfg')
const hp = require('./util/humanize-path')
const providers = require('./providers')
const configFiles = require('./util/config-files')
const checkForUpdates = require('./util/updates')
const getUser = require('./util/get-user')
const exit = require('./util/exit')

const NOW_DIR = getNowDir()
const NOW_CONFIG_PATH = configFiles.getConfigFilePath()
const NOW_AUTH_CONFIG_PATH = configFiles.getAuthConfigFilePath()

const GLOBAL_COMMANDS = new Set(['help'])

const main = async (argv_) => {
  await checkForUpdates()

  const argv = mri(argv_, {
    boolean: [
      'help',
      'version'
    ],
    string: [
      'token',
      'team',
      'api'
    ],
    alias: {
      help: 'h',
      version: 'v',
      token: 't',
      team: 'T'
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
      console.error(error(
        'An unexpected error occurred while trying to create the ' +
          `now global directory "${hp(NOW_DIR)}" ` +
          err.message
      ))
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
    const directory = param(hp(NOW_DIR))
    console.log(info(`Your credentials and configuration were migrated to ${directory}`))
  }

  // the context object to supply to the providers or the commands
  const ctx: Object = {
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
      debug(`falling back to default now provider 'sh'`)
      defaultProvider = 'sh'
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

  const { sh } = ctx.config
  ctx.apiUrl = 'https://api.zeit.co'

  if (argv.api && typeof argv.api === 'string') {
    ctx.apiUrl = argv.api
  } else if (sh && sh.api) {
    ctx.apiUrl = sh.api
  }

  const localConfig = configFiles.readLocalConfig()

  if (localConfig) {
    if (localConfig.api) {
      ctx.apiUrl = localConfig.api
      delete localConfig.api
    }

    Object.assign(ctx.config, localConfig)
  }

  // $FlowFixMe
  const { isTTY } = process.stdout

  // If no credentials are set at all, prompt for
  // login to the .sh provider
  if (
    !authConfig.credentials.length &&
    !ctx.argv.includes('-h') && !ctx.argv.includes('--help') &&
    !argv.token &&
    subcommand !== 'login'
  ) {
    if (isTTY) {
      console.log(info(`No existing credentials found. Please log in:`))

      subcommand = 'login'
      ctx.argv[2] = 'login'

      // Ensure that sub commands lead to login as well, if
      // no credentials are defined
      ctx.argv = ctx.argv.splice(0, 3)
    } else {
      console.error(error({
        message: 'No existing credentials found. Please run ' +
        `${param('now login')} or pass ${param('--token')}`,
        slug: 'no-credentials-found'
      }))

      await exit(1)
    }
  }

  if (typeof argv.token === 'string' && subcommand === 'switch') {
    console.error(error({
      message: `This command doesn't work with ${param('--token')}. Please use ${param('--team')}.`,
      slug: 'no-token-allowed'
    }))

    await exit(1)
  }

  if (typeof argv.token === 'string') {
    const {token} = argv

    if (token.length === 0) {
      console.error(error({
        message: `You defined ${param('--token')}, but it's missing a value`,
        slug: 'missing-token-value'
      }))

      await exit(1)
    }

    const obj = {
      provider: 'sh',
      token
    }

    const credentialsIndex = ctx.authConfig.credentials.findIndex(
      cred => cred.provider === 'sh'
    )

    if (credentialsIndex === -1) {
      ctx.authConfig.credentials.push(obj)
    } else {
      ctx.authConfig.credentials[credentialsIndex] = obj
    }

    const user = await getUser({
      apiUrl: ctx.apiUrl,
      token
    })

    ctx.config.sh = Object.assign(ctx.config.sh || {}, { user })
  }

  if (typeof argv.team === 'string' && subcommand !== 'login') {
    const { team } = argv
    const { sh } = ctx.config

    if (team.length === 0) {
      console.error(error({
        message: `You defined ${param('--team')}, but it's missing a value`,
        slug: 'missing-team-value'
      }))

      await exit(1)
    }

    const cachedUser = sh && sh.user && sh.user.username === team

    if (cachedUser) {
      delete ctx.config.sh.currentTeam
    }

    const cachedTeam = sh && sh.currentTeam && sh.currentTeam.slug === team

    // Only download team data if not cached
    if (!cachedTeam && !cachedUser) {
      const { token } = ctx.authConfig.credentials.find(item => item.provider === 'sh')

      const headers = {
        Authorization: `Bearer ${token}`
      }

      const url = `https://api.zeit.co/teams/?slug=${team}`
      let body

      try {
        const res = await fetch(url, { headers })

        if (res.status === 403) {
          console.error(error({
            message: `You don't have access to the specified team`,
            slug: 'team-not-accessible'
          }))

          await exit(1)
        }

        body = await res.json()
      } catch (err) {
        console.error(error('Not able to load teams'))
        await exit(1)
      }

      if (!body || body.error) {
        console.error(error({
          message: 'The specified team doesn\'t exist',
          slug: 'team-not-existent'
        }))

        await exit(1)
      }

      // $FlowFixMe
      delete body.creator_id

      // $FlowFixMe
      delete body.created

      ctx.config.sh.currentTeam = body
    }
  }

  try {
    process.exit(await provider[subcommand](ctx))
  } catch (err) {
    console.error(
      error(
        `An unexpected error occurred in ${subcommand}: ${err.stack}`
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
