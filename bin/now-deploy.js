#!/usr/bin/env node

// Native
const { resolve } = require('path')

// Packages
const Progress = require('progress')
const fs = require('fs-promise')
const bytes = require('bytes')
const chalk = require('chalk')
const minimist = require('minimist')
const ms = require('ms')
const flatten = require('arr-flatten')
const dotenv = require('dotenv')
const retry = require('async-retry')
const { eraseLines } = require('ansi-escapes')
const { write: copy } = require('clipboardy')

// Ours
const login = require('../lib/login')
const cfg = require('../lib/cfg')
const { version } = require('../lib/pkg')
const Logger = require('../lib/build-logger')
const Now = require('../lib')
const toHumanPath = require('../lib/utils/to-human-path')
const promptOptions = require('../lib/utils/prompt-options')
const { handleError, error } = require('../lib/error')
const { fromGit, isRepoPath, gitPathParts } = require('../lib/git')
const readMetaData = require('../lib/read-metadata')
const checkPath = require('../lib/utils/check-path')
const { reAlias, assignAlias } = require('../lib/re-alias')
const exit = require('../lib/utils/exit')
const logo = require('../lib/utils/output/logo')
const cmd = require('../lib/utils/output/cmd')
const info = require('../lib/utils/output/info')
const wait = require('../lib/utils/output/wait')
const NowPlans = require('../lib/plans')
const promptBool = require('../lib/utils/input/prompt-bool')
const note = require('../lib/utils/output/note')

const argv = minimist(process.argv.slice(2), {
  string: ['config', 'token', 'name', 'alias'],
  boolean: [
    'help',
    'version',
    'debug',
    'force',
    'links',
    'login',
    'no-clipboard',
    'forward-npm',
    'docker',
    'npm',
    'static'
  ],
  alias: {
    env: 'e',
    dotenv: 'E',
    help: 'h',
    config: 'c',
    debug: 'd',
    version: 'v',
    force: 'f',
    token: 't',
    forceSync: 'F',
    links: 'l',
    login: 'L',
    public: 'p',
    'no-clipboard': 'C',
    'forward-npm': 'N',
    name: 'n',
    alias: 'a'
  }
})

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now`)} [options] <command | path>

  ${chalk.dim('Commands:')}

    ${chalk.dim('Cloud')}

      deploy               [path]      Performs a deployment ${chalk.bold('(default)')}
      ls | list            [app]       List deployments
      rm | remove          [id]        Remove a deployment
      ln | alias           [id] [url]  Configures aliases for deployments
      domains              [name]      Manages your domain names
      certs                [cmd]       Manages your SSL certificates
      secrets              [name]      Manages your secret environment variables
      dns                  [name]      Manages your DNS records
      logs                 [url]       Displays the logs for a deployment
      scale                [args]      Scales the instance count of a deployment
      help                 [cmd]       Displays complete help for [cmd]

    ${chalk.dim('Administrative')}

      billing | cc         [cmd]       Manages your credit cards and billing methods
      upgrade | downgrade  [plan]      Upgrades or downgrades your plan
      teams                [team]      Manages your teams
      switch                           Switches between teams and your account
      login                            Login into your account or creates a new one
      logout                           Logout from your account

  ${chalk.dim('Options:')}

    -h, --help                Output usage information
    -v, --version             Output the version number
    -n, --name                Set the name of the deployment
    -c ${chalk.underline('FILE')}, --config=${chalk.underline('FILE')}    Config file
    -d, --debug               Debug mode [off]
    -f, --force               Force a new deployment even if nothing has changed
    -t ${chalk.underline('TOKEN')}, --token=${chalk.underline('TOKEN')}   Login token
    -L, --login               Configure login
    -l, --links               Copy symlinks without resolving their target
    -p, --public              Deployment is public (${chalk.dim('`/_src`')} is exposed) [on for oss, off for premium]
    -e, --env                 Include an env var (e.g.: ${chalk.dim('`-e KEY=value`')}). Can appear many times.
    -E ${chalk.underline('FILE')}, --dotenv=${chalk.underline('FILE')}    Include env vars from .env file. Defaults to '.env'
    -C, --no-clipboard        Do not attempt to copy URL to clipboard
    -N, --forward-npm         Forward login information to install private npm modules

  ${chalk.dim('Enforcable Types (when both package.json and Dockerfile exist):')}

    --npm                     Node.js application
    --docker                  Docker container
    --static                  Static file hosting

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Deploys the current directory

    ${chalk.cyan('$ now')}

  ${chalk.gray('–')} Deploys a custom path ${chalk.dim('`/usr/src/project`')}

    ${chalk.cyan('$ now /usr/src/project')}

  ${chalk.gray('–')} Deploys a GitHub repository

    ${chalk.cyan('$ now user/repo#ref')}

  ${chalk.gray('–')} Deploys a GitHub, GitLab or Bitbucket repo using its URL

    ${chalk.cyan('$ now https://gitlab.com/user/repo')}

  ${chalk.gray('–')} Deploys with ENV vars

    ${chalk.cyan('$ now -e NODE_ENV=production -e MYSQL_PASSWORD=@mysql-password')}

  ${chalk.gray('–')} Displays comprehensive help for the subcommand ${chalk.dim('`list`')}

    ${chalk.cyan('$ now help list')}
`)
}

let path = argv._[0]

if (path) {
  // If path is relative: resolve
  // if path is absolute: clear up strange `/` etc
  path = resolve(process.cwd(), path)
} else {
  path = process.cwd()
}

// If the current deployment is a repo
const gitRepo = {}

// Options
let forceNew = argv.force
let deploymentName = argv.name
const debug = argv.debug
const clipboard = !argv['no-clipboard']
const forwardNpm = argv['forward-npm']
const forceSync = argv.forceSync
const shouldLogin = argv.login
const followSymlinks = !argv.links
const wantsPublic = argv.public
const apiUrl = argv.url || 'https://api.zeit.co'
const isTTY = process.stdout.isTTY
const quiet = !isTTY
const autoAliases = typeof argv.alias === 'undefined'
  ? false
  : flatten([argv.alias])

if (argv.config) {
  cfg.setConfigFile(argv.config)
}

if (Array.isArray(autoAliases)) {
  console.log(
    `${chalk.red('Deprecated!')} The option ${chalk.grey('--alias')} will be removed soon.`
  )
  console.log('Read more about the new way here: http://bit.ly/2l2v5Fg\n')
}

const stopDeployment = msg => {
  error(msg)
  process.exit(1)
}

// Create a new deployment if user changed the name or made `_src` public.
// This works fine because it doesn't force a new sync,
// it just forces a new deployment.
if (deploymentName || wantsPublic) {
  forceNew = true
}

let alwaysForwardNpm

async function main() {
  let config = await cfg.read({ token: argv.token })
  alwaysForwardNpm = config.forwardNpm

  if (argv.h || argv.help) {
    help()
    return exit(0)
  } else if (argv.v || argv.version) {
    console.log(version)
    return exit(0)
  }

  let token = argv.token || config.token
  if (!token || shouldLogin) {
    try {
      token = await login(apiUrl)
      config = await cfg.read()
    } catch (err) {
      return stopDeployment(`Authentication error – ${err.message}`)
    }
    if (shouldLogin) {
      console.log('> Logged in successfully. Token saved in ~/.now.json')
      return exit(0)
    }
  }

  // If we got to here then `token` should be set
  try {
    await sync({ token, config })
  } catch (err) {
    return stopDeployment(`Unknown error: ${err}\n${err.stack}`)
  }
}

async function sync({ token, config: { currentTeam, user } }) {
  const start = Date.now()
  const rawPath = argv._[0]

  const planPromise = new NowPlans({
    apiUrl,
    token,
    debug,
    currentTeam
  }).getCurrent()

  try {
    await fs.stat(path)
  } catch (err) {
    let repo
    let isValidRepo = false

    try {
      isValidRepo = isRepoPath(rawPath)
    } catch (err) {
      if (err.code === 'INVALID_URL') {
        stopDeployment(err)
      } else {
        throw err
      }
    }

    if (isValidRepo) {
      const gitParts = gitPathParts(rawPath)
      Object.assign(gitRepo, gitParts)

      const searchMessage = setTimeout(() => {
        console.log(`> Didn't find directory. Searching on ${gitRepo.type}...`)
      }, 500)

      try {
        repo = await fromGit(rawPath, debug)
      } catch (err) {}

      clearTimeout(searchMessage)
    }

    if (repo) {
      // Tell now which directory to deploy
      path = repo.path

      // Set global variable for deleting tmp dir later
      // once the deployment has finished
      Object.assign(gitRepo, repo)
    } else if (isValidRepo) {
      const gitRef = gitRepo.ref ? `with "${chalk.bold(gitRepo.ref)}" ` : ''
      stopDeployment(
        `There's no repository named "${chalk.bold(gitRepo.main)}" ${gitRef}on ${gitRepo.type}`
      )
    } else {
      stopDeployment(`Could not read directory ${chalk.bold(path)}`)
    }
  }

  // Make sure that directory is deployable
  try {
    await checkPath(path)
  } catch (err) {
    error(err)
    return
  }

  if (!quiet) {
    if (gitRepo.main) {
      const gitRef = gitRepo.ref ? ` at "${chalk.bold(gitRepo.ref)}" ` : ''
      console.log(
        `> Deploying ${gitRepo.type} repository "${chalk.bold(gitRepo.main)}" ${gitRef} under ${chalk.bold((currentTeam && currentTeam.slug) || user.username || user.email)}`
      )
    } else {
      console.log(
        `> Deploying ${chalk.bold(toHumanPath(path))} under ${chalk.bold((currentTeam && currentTeam.slug) || user.username || user.email)}`
      )
    }
  }

  let nowConfig
  let deploymentType

  // CLI deployment type explicit overrides
  if (argv.docker) {
    if (debug) {
      console.log(`> [debug] Forcing \`deploymentType\` = \`docker\``)
    }

    deploymentType = 'docker'
  } else if (argv.npm) {
    if (debug) {
      console.log(`> [debug] Forcing \`deploymentType\` = \`npm\``)
    }

    deploymentType = 'npm'
  } else if (argv.static) {
    if (debug) {
      console.log(`> [debug] Forcing \`deploymentType\` = \`static\``)
    }

    deploymentType = 'static'
  }

  let meta
  await retry(
    async bail => {
      try {
        meta = await readMetaData(path, {
          deploymentType,
          deploymentName,
          quiet: true
        })

        nowConfig = meta.nowConfig

        if (!deploymentType) {
          deploymentType = meta.type

          if (debug) {
            console.log(
              `> [debug] Detected \`deploymentType\` = \`${deploymentType}\``
            )
          }
        }

        if (!deploymentName) {
          deploymentName = meta.name

          if (debug) {
            console.log(
              `> [debug] Detected \`deploymentName\` = "${deploymentName}"`
            )
          }
        }
      } catch (err) {
        if (err.code === 'MULTIPLE_MANIFESTS') {
          if (debug) {
            console.log('> [debug] Multiple manifests found, disambiguating')
          }

          if (isTTY) {
            console.log(
              `> Two manifests found. Press [${chalk.bold('n')}] to deploy or re-run with --flag`
            )
            try {
              deploymentType = await promptOptions([
                [
                  'npm',
                  `${chalk.bold('package.json')}\t${chalk.gray('   --npm')} `
                ],
                [
                  'docker',
                  `${chalk.bold('Dockerfile')}\t${chalk.gray('--docker')} `
                ]
              ])
            } catch (err) {
              console.error(err)
              return bail()
            }

            if (debug) {
              console.log(
                `> [debug] Selected \`deploymentType\` = "${deploymentType}"`
              )
            }

            // Invoke async-retry and try again with the explicit deployment type
            throw err
          }
        }

        return stopDeployment(err)
      }
    },
    {
      retries: 1,
      minTimeout: 0,
      maxTimeout: 0,
      onRetry: console.log
    }
  )

  const now = new Now({ apiUrl, token, debug, currentTeam })

  let dotenvConfig
  let dotenvOption

  if (argv.dotenv) {
    dotenvOption = argv.dotenv
  } else if (nowConfig && nowConfig.dotenv) {
    dotenvOption = nowConfig.dotenv
  }

  if (dotenvOption) {
    const dotenvFileName = typeof dotenvOption === 'string'
      ? dotenvOption
      : '.env'

    if (!fs.existsSync(dotenvFileName)) {
      error(`--dotenv flag is set but ${dotenvFileName} file is missing`)
      return process.exit(1)
    }

    const dotenvFile = await fs.readFile(dotenvFileName)
    dotenvConfig = dotenv.parse(dotenvFile)
  }

  // Merge `now.env` from package.json with `-e` arguments.
  const pkgEnv = nowConfig && nowConfig.env
  const envs = [
    ...Object.keys(dotenvConfig || {}).map(k => `${k}=${dotenvConfig[k]}`),
    ...Object.keys(pkgEnv || {}).map(k => `${k}=${pkgEnv[k]}`),
    ...[].concat(argv.env || [])
  ]

  let secrets
  const findSecret = async uidOrName => {
    if (!secrets) {
      secrets = await now.listSecrets()
    }

    return secrets.filter(secret => {
      return secret.name === uidOrName || secret.uid === uidOrName
    })
  }

  const env_ = await Promise.all(
    envs.map(async kv => {
      if (typeof kv !== 'string') {
        error('Env key and value missing')
        return process.exit(1)
      }

      const [key, ...rest] = kv.split('=')
      let val

      if (rest.length > 0) {
        val = rest.join('=')
      }

      if (/[^A-z0-9_]/i.test(key)) {
        error(
          `Invalid ${chalk.dim('-e')} key ${chalk.bold(`"${chalk.bold(key)}"`)}. Only letters, digits and underscores are allowed.`
        )
        return process.exit(1)
      }

      if (!key) {
        error(`Invalid env option ${chalk.bold(`"${kv}"`)}`)
        return process.exit(1)
      }

      if (val === undefined) {
        if (key in process.env) {
          console.log(
            `> Reading ${chalk.bold(`"${chalk.bold(key)}"`)} from your env (as no value was specified)`
          )
          // Escape value if it begins with @
          val = process.env[key].replace(/^@/, '\\@')
        } else {
          error(
            `No value specified for env ${chalk.bold(`"${chalk.bold(key)}"`)} and it was not found in your env.`
          )
          return process.exit(1)
        }
      }

      if (val[0] === '@') {
        const uidOrName = val.substr(1)
        const secrets = await findSecret(uidOrName)
        if (secrets.length === 0) {
          if (uidOrName === '') {
            error(
              `Empty reference provided for env key ${chalk.bold(`"${chalk.bold(key)}"`)}`
            )
          } else {
            error(
              `No secret found by uid or name ${chalk.bold(`"${uidOrName}"`)}`
            )
          }
          return process.exit(1)
        } else if (secrets.length > 1) {
          error(
            `Ambiguous secret ${chalk.bold(`"${uidOrName}"`)} (matches ${chalk.bold(secrets.length)} secrets)`
          )
          return process.exit(1)
        }

        val = { uid: secrets[0].uid }
      }

      return [key, typeof val === 'string' ? val.replace(/^\\@/, '@') : val]
    })
  )

  const env = {}
  env_.filter(v => Boolean(v)).forEach(([key, val]) => {
    if (key in env) {
      note(`Overriding duplicate env key ${chalk.bold(`"${key}"`)}`)
    }

    env[key] = val
  })

  try {
    await now.create(
      path,
      Object.assign(
        {
          env,
          followSymlinks,
          forceNew,
          forceSync,
          forwardNpm: alwaysForwardNpm || forwardNpm,
          quiet,
          wantsPublic
        },
        meta
      )
    )
  } catch (err) {
    if (debug) {
      console.log(`> [debug] error: ${err}\n${err.stack}`)
    }

    handleError(err)
    process.exit(1)
  }

  const { url } = now
  const elapsed = ms(new Date() - start)

  if (isTTY) {
    if (clipboard) {
      try {
        await copy(url)
        console.log(
          `${chalk.cyan('> Ready!')} ${chalk.bold(url)} (copied to clipboard) [${elapsed}]`
        )
      } catch (err) {
        console.log(`${chalk.cyan('> Ready!')} ${chalk.bold(url)} [${elapsed}]`)
      }
    } else {
      console.log(`> ${url} [${elapsed}]`)
    }
  } else {
    process.stdout.write(url)
  }

  const startU = new Date()

  const complete = () => {
    if (!quiet) {
      const elapsedU = ms(new Date() - startU)
      console.log(`> Sync complete (${bytes(now.syncAmount)}) [${elapsedU}] `)
      console.log('> Initializing…')
    }

    // Close http2 agent
    now.close()

    // Show build logs
    if (deploymentType === 'static') {
      console.log(`${chalk.cyan('> Deployment complete!')}`)
    } else {
      printLogs(now.host, token, currentTeam, user)
    }
  }

  const plan = await planPromise

  if (plan.id === 'oss') {
    if (isTTY) {
      info(
        `${chalk.bold((currentTeam && `${currentTeam.slug} is`) || `You (${user.username || user.email}) are`)} on the OSS plan. Your code will be made ${chalk.bold('public')}.`
      )

      let proceed
      try {
        const label = 'Are you sure you want to proceed with the deployment?'
        proceed = await promptBool(label, { trailing: eraseLines(1) })
      } catch (err) {
        if (err.message === 'USER_ABORT') {
          proceed = false
        } else {
          throw err
        }
      }

      if (!proceed) {
        const stopSpinner = wait('Canceling deployment')
        await now.remove(now.id, { hard: true })
        stopSpinner()
        info('Deployment aborted. No files were synced.')
        info(`You can upgrade by running ${cmd('now upgrade')}.`)
        return exit()
      }
    } else if (!wantsPublic) {
      let msg = '\nYou are on the OSS plan. Your code will be made public.'
      msg += ' If you agree with that, please run again with --public.'
      console.log(msg)
      return exit(1)
    }
  }

  if (now.syncAmount) {
    const bar = new Progress('> Upload [:bar] :percent :etas', {
      width: 20,
      complete: '=',
      incomplete: '',
      total: now.syncAmount
    })

    now.upload()

    now.on('upload', ({ names, data }) => {
      const amount = data.length
      if (debug) {
        console.log(
          `> [debug] Uploaded: ${names.join(' ')} (${bytes(data.length)})`
        )
      }
      bar.tick(amount)
    })

    now.on('complete', complete)

    now.on('error', err => {
      error('Upload failed')
      handleError(err)
      process.exit(1)
    })
  } else {
    if (!quiet) {
      console.log(`> Initializing…`)
    }

    // Close http2 agent
    now.close()

    // Show build logs
    if (deploymentType === 'static') {
      console.log(`${chalk.cyan('> Deployment complete!')}`)
    } else {
      printLogs(now.host, token, currentTeam, user)
    }
  }
}

function printLogs(host, token, currentTeam, user) {
  // Log build
  const logger = new Logger(host, token, { debug, quiet })

  logger.on('error', async err => {
    if (!quiet) {
      if (err && err.type === 'BUILD_ERROR') {
        error(
          `The build step of your project failed. To retry, run ${cmd('now --force')}.`
        )
      } else {
        error('Deployment failed')
      }
    }

    if (gitRepo && gitRepo.cleanup) {
      // Delete temporary directory that contains repository
      gitRepo.cleanup()

      if (debug) {
        console.log(`> [debug] Removed temporary repo directory`)
      }
    }
    process.exit(1)
  })

  logger.on('close', async () => {
    if (Array.isArray(autoAliases)) {
      const aliasList = autoAliases.filter(item => item !== '')

      if (aliasList.length > 0) {
        const assignments = []

        for (const alias of aliasList) {
          assignments.push(
            assignAlias(alias, token, host, apiUrl, debug, currentTeam, user)
          )
        }

        await Promise.all(assignments)
      } else {
        await reAlias(
          token,
          host,
          null,
          help,
          exit,
          apiUrl,
          debug,
          currentTeam,
          user
        )
      }
    }

    if (!quiet) {
      console.log(`${chalk.cyan('> Deployment complete!')}`)
    }

    if (gitRepo && gitRepo.cleanup) {
      // Delete temporary directory that contains repository
      gitRepo.cleanup()

      if (debug) {
        console.log(`> [debug] Removed temporary repo directory`)
      }
    }

    process.exit(0)
  })
}

main()
