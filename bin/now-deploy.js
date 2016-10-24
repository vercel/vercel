#!/usr/bin/env node

// Native
import {resolve} from 'path'

// Packages
import Progress from 'progress'
import {stat} from 'fs-promise'
import bytes from 'bytes'
import chalk from 'chalk'
import minimist from 'minimist'
import ms from 'ms'

// Ours
import copy from '../lib/copy'
import login from '../lib/login'
import * as cfg from '../lib/cfg'
import {version} from '../../package'
import Logger from '../lib/build-logger'
import Now from '../lib'
import toHumanPath from '../lib/utils/to-human-path'
import promptOptions from '../lib/utils/prompt-options'
import {handleError, error} from '../lib/error'

const argv = minimist(process.argv.slice(2), {
  string: [
    'config',
    'token'
  ],
  boolean: [
    'help',
    'version',
    'debug',
    'force',
    'login',
    'no-clipboard',
    'forward-npm',
    'docker',
    'npm'
  ],
  alias: {
    env: 'e',
    help: 'h',
    config: 'c',
    debug: 'd',
    version: 'v',
    force: 'f',
    token: 't',
    forceSync: 'F',
    login: 'L',
    public: 'p',
    'no-clipboard': 'C',
    'forward-npm': 'N'
  }
})

const help = () => {
  console.log(`
  ${chalk.bold('𝚫 now')} [options] <command | path>

  ${chalk.dim('Commands:')}

    deploy       [path]       Performs a deployment ${chalk.bold('(default)')}
    static       [path]       Share project using a static file server
    ls | list    [app]        List deployments
    rm | remove  [id]         Remove a deployment
    ln | alias   [id] [url]   Configures aliases for deployments
    domains      [name]       Manages your domain names
    certs        [cmd]        Manages your SSL certificates
    secrets      [name]       Manages your secret environment variables
    help         [cmd]        Displays complete help for [cmd]

  ${chalk.dim('Options:')}

    -h, --help                Output usage information
    -v, --version             Output the version number
    -c ${chalk.underline('FILE')}, --config=${chalk.underline('FILE')}    Config file
    -d, --debug               Debug mode [off]
    -f, --force               Force a new deployment even if nothing has changed
    -t ${chalk.underline('TOKEN')}, --token=${chalk.underline('TOKEN')}   Login token
    -L, --login               Configure login
    -p, --public              Deployment is public (${chalk.dim('`/_src`')} is exposed) [on for oss, off for premium]
    -e, --env                 Include an env var (e.g.: ${chalk.dim('`-e KEY=value`')}). Can appear many times.
    -C, --no-clipboard        Do not attempt to copy URL to clipboard
    -N, --forward-npm         Forward login information to install private NPM modules
    --npm                     Force npm deployment (when both package.json and Dockerfile exist)
    --docker                  Force docker deployment (when both package.json and Dockerfile exist)

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Deploys the current directory

    ${chalk.cyan('$ now')}

  ${chalk.gray('–')} Deploys a custom path ${chalk.dim('`/usr/src/project`')}

    ${chalk.cyan('$ now /usr/src/project')}

  ${chalk.gray('–')} Lists all deployments with their IDs

    ${chalk.cyan('$ now ls')}

  ${chalk.gray('–')} Associates deployment ${chalk.dim('`deploymentId`')} with ${chalk.dim('`custom-domain.com`')}

    ${chalk.cyan('$ now alias deploymentId custom-domain.com')}

  ${chalk.gray('–')} Stores a secret

    ${chalk.cyan('$ now secret add mysql-password 123456')}

  ${chalk.gray('–')} Deploys with ENV vars (using the ${chalk.dim('`mysql-password`')} secret stored above)

    ${chalk.cyan('$ now -e NODE_ENV=production -e MYSQL_PASSWORD=@mysql-password')}

  ${chalk.gray('–')} Displays comprehensive help for the subcommand ${chalk.dim('`list`')}

    ${chalk.cyan('$ now help list')}
`)
}

let path = argv._[0]

if (path) {
  // if path is relative: resolve
  // if path is absolute: clear up strange `/` etc
  path = resolve(process.cwd(), path)
} else {
  path = process.cwd()
}

const exit = code => {
  // we give stdout some time to flush out
  // because there's a node bug where
  // stdout writes are asynchronous
  // https://github.com/nodejs/node/issues/6456
  setTimeout(() => process.exit(code || 0), 100)
}

// options
const debug = argv.debug
const clipboard = !argv['no-clipboard']
const forwardNpm = argv['forward-npm']
const forceNew = argv.force
const forceSync = argv.forceSync
const shouldLogin = argv.login
const wantsPublic = argv.public
const apiUrl = argv.url || 'https://api.zeit.co'
const isTTY = process.stdout.isTTY
const quiet = !isTTY

if (argv.config) {
  cfg.setConfigFile(argv.config)
}

const config = cfg.read()
const alwaysForwardNpm = config.forwardNpm

if (argv.h || argv.help) {
  help()
  exit(0)
} else if (argv.v || argv.version) {
  console.log(chalk.bold('𝚫 now'), version)
  process.exit(0)
} else if (!(argv.token || config.token) || shouldLogin) {
  login(apiUrl)
  .then(token => {
    if (shouldLogin) {
      console.log('> Logged in successfully. Token saved in ~/.now.json')
      process.exit(0)
    } else {
      sync(token).catch(err => {
        error(`Unknown error: ${err.stack}`)
        process.exit(1)
      })
    }
  })
  .catch(e => {
    error(`Authentication error – ${e.message}`)
    process.exit(1)
  })
} else {
  sync(argv.token || config.token).catch(err => {
    error(`Unknown error: ${err.stack}`)
    process.exit(1)
  })
}

async function sync(token) {
  const start = Date.now()

  if (!quiet) {
    console.log(`> Deploying ${chalk.bold(toHumanPath(path))}`)
  }

  try {
    await stat(path)
  } catch (err) {
    error(`Could not read directory ${chalk.bold(path)}`)
    process.exit(1)
  }

  let deploymentType
  let hasPackage
  let hasDockerfile

  if (argv.docker) {
    if (debug) {
      console.log(`> [debug] Forcing \`deploymentType\` = \`docker\``)
    }
    deploymentType = 'docker'
  } else if (argv.npm) {
    deploymentType = 'npm'
  } else {
    try {
      await stat(resolve(path, 'package.json'))
    } catch (err) {
      hasPackage = true
    }

    [hasPackage, hasDockerfile] = await Promise.all([
      await (async () => {
        try {
          await stat(resolve(path, 'package.json'))
        } catch (err) {
          return false
        }
        return true
      })(),
      await (async () => {
        try {
          await stat(resolve(path, 'Dockerfile'))
        } catch (err) {
          return false
        }
        return true
      })()
    ])

    if (hasPackage && hasDockerfile) {
      if (debug) {
        console.log('[debug] multiple manifests found, disambiguating')
      }

      if (isTTY) {
        try {
          console.log(`> Two manifests found. Press [${chalk.bold('n')}] to deploy or re-run with --flag`)
          deploymentType = await promptOptions([
              ['npm', `${chalk.bold('package.json')}\t${chalk.gray('   --npm')} `],
              ['docker', `${chalk.bold('Dockerfile')}\t${chalk.gray('--docker')} `]
          ])
        } catch (err) {
          error(err.message)
          process.exit(1)
        }
      } else {
        error('Ambiguous deployment (`package.json` and `Dockerfile` found). ' +
            'Please supply `--npm` or `--docker` to disambiguate.')
      }
    } else if (hasPackage) {
      if (debug) {
        console.log('[debug] `package.json` found, assuming `deploymentType` = `npm`')
      }

      deploymentType = 'npm'
    } else if (hasDockerfile) {
      if (debug) {
        console.log('[debug] `Dockerfile` found, assuming `deploymentType` = `docker`')
      }

      deploymentType = 'docker'
    } else {
      error(`Could not access a ${chalk.dim('`package.json`')} or ${chalk.dim('`Dockerfile`')} in ${chalk.bold(path)}`)
      console.log(`> To deploy statically, try: ${chalk.dim(chalk.underline('https://zeit.co/blog/serve-it-now'))}.`)
      process.exit(1)
    }
  }

  const now = new Now(apiUrl, token, {debug})
  const envs = [].concat(argv.env || [])

  let secrets
  const findSecret = async uidOrName => {
    if (!secrets) {
      secrets = await now.listSecrets()
    }

    return secrets.filter(secret => {
      return secret.name === uidOrName || secret.uid === uidOrName
    })
  }

  const env_ = await Promise.all(envs.map(async kv => {
    const [key, ...rest] = kv.split('=')
    let val

    if (rest.length > 0) {
      val = rest.join('=')
    }

    if (/[^A-z0-9_]/i.test(key)) {
      error(`Invalid ${chalk.dim('-e')} key ${chalk.bold(`"${chalk.bold(key)}"`)}. Only letters, digits and underscores are allowed.`)
      return process.exit(1)
    }

    if (key === '' || key === null) {
      error(`Invalid env option ${chalk.bold(`"${kv}"`)}`)
      return process.exit(1)
    }

    if (val === null) {
      if ((key in process.env)) {
        console.log(`> Reading ${chalk.bold(`"${chalk.bold(key)}"`)} from your env (as no value was specified)`)
        // escape value if it begins with @
        val = process.env[key].replace(/^\@/, '\\@')
      } else {
        error(`No value specified for env ${chalk.bold(`"${chalk.bold(key)}"`)} and it was not found in your env.`)
        return process.exit(1)
      }
    }

    if (val[0] === '@') {
      const uidOrName = val.substr(1)
      const secrets = await findSecret(uidOrName)
      if (secrets.length === 0) {
        if (uidOrName === '') {
          error(`Empty reference provided for env key ${chalk.bold(`"${chalk.bold(key)}"`)}`)
        } else {
          error(`No secret found by uid or name ${chalk.bold(`"${uidOrName}"`)}`)
        }
        return process.exit(1)
      } else if (secrets.length > 1) {
        error(`Ambiguous secret ${chalk.bold(`"${uidOrName}"`)} (matches ${chalk.bold(secrets.length)} secrets)`)
        return process.exit(1)
      }

      val = {uid: secrets[0].uid}
    }

    return [
      key,
      typeof val === 'string' ? val.replace(/^\\@/, '@') : val
    ]
  }))

  const env = {}
  env_
  .filter(v => Boolean(v))
  .forEach(([key, val]) => {
    if (key in env) {
      console.log(`> ${chalk.yellow('NOTE:')} Overriding duplicate env key ${chalk.bold(`"${key}"`)}`)
    }

    env[key] = val
  })

  try {
    await now.create(path, {
      env,
      deploymentType,
      forceNew,
      forceSync,
      forwardNpm: alwaysForwardNpm || forwardNpm,
      quiet,
      wantsPublic
    })
  } catch (err) {
    if (debug) {
      console.log(`> [debug] error: ${err.stack}`)
    }

    handleError(err)
    process.exit(1)
  }

  const {url} = now
  const elapsed = ms(new Date() - start)

  if (isTTY) {
    if (clipboard) {
      try {
        await copy(url)
        console.log(`${chalk.cyan('> Ready!')} ${chalk.bold(url)} (copied to clipboard) [${elapsed}]`)
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

    // close http2 agent
    now.close()

    // show build logs
    printLogs(now.host)
  }

  if (now.syncAmount) {
    const bar = new Progress('> Upload [:bar] :percent :etas', {
      width: 20,
      complete: '=',
      incomplete: '',
      total: now.syncAmount
    })

    now.upload()

    now.on('upload', ({names, data}) => {
      const amount = data.length
      if (debug) {
        console.log(`> [debug] Uploaded: ${names.join(' ')} (${bytes(data.length)})`)
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

    // close http2 agent
    now.close()

    // show build logs
    printLogs(now.host)
  }
}

function printLogs(host) {
  // log build
  const logger = new Logger(host, {debug, quiet})
  logger.on('close', () => {
    if (!quiet) {
      console.log(`${chalk.cyan('> Deployment complete!')}`)
    }
    process.exit(0)
  })
}
