// Native
import {homedir} from 'os'
import {resolve as resolvePath, join as joinPaths} from 'path'
import EventEmitter from 'events'

// Packages
import bytes from 'bytes'
import chalk from 'chalk'
import retry from 'async-retry'
import {parse as parseIni} from 'ini'
import {readFile} from 'fs-promise'
import resumer from 'resumer'
import splitArray from 'split-array'

// Ours
import {npm as getNpmFiles, docker as getDockerFiles} from './get-files'
import ua from './ua'
import hash from './hash'
import Agent from './agent'
import readMetaData from './read-metadata'

// how many concurrent HTTP/2 stream uploads
const MAX_CONCURRENT = 10

// check if running windows
const IS_WIN = /^win/.test(process.platform)
const SEP = IS_WIN ? '\\' : '/'

export default class Now extends EventEmitter {
  constructor(url, token, {forceNew = false, debug = false}) {
    super()
    this._token = token
    this._debug = debug
    this._forceNew = forceNew
    this._agent = new Agent(url, {debug})
    this._onRetry = this._onRetry.bind(this)
  }

  async create(path, {
    wantsPublic,
    quiet = false,
    env = {},
    forceNew = false,
    forceSync = false,
    forwardNpm = false,
    deploymentType = 'npm',
    deploymentName,
    isStatic = false
  }) {
    this._path = path
    this._static = isStatic

    let files

    const {pkg, name, description} = await readMetaData(path, {
      deploymentType,
      deploymentName,
      quiet,
      isStatic
    })

    if (this._debug) {
      console.time('> [debug] Getting files')
    }

    if (deploymentType === 'npm') {
      files = await getNpmFiles(path, pkg, {debug: this._debug})
    } else {
      files = await getDockerFiles(path, {debug: this._debug})
    }

    if (this._debug) {
      console.timeEnd('> [debug] Getting files')
    }

    const nowProperties = pkg ? pkg.now || {} : {}

    forwardNpm = forwardNpm || nowProperties.forwardNpm

    // Read .npmrc
    let npmrc = {}
    let authToken
    if (deploymentType === 'npm' && forwardNpm) {
      try {
        npmrc = await readFile(resolvePath(path, '.npmrc'), 'utf8')
        npmrc = parseIni(npmrc)
        authToken = npmrc['//registry.npmjs.org/:_authToken']
      } catch (err) {
        // Do nothing
      }

      if (!authToken) {
        try {
          npmrc = await readFile(resolvePath(homedir(), '.npmrc'), 'utf8')
          npmrc = parseIni(npmrc)
          authToken = npmrc['//registry.npmjs.org/:_authToken']
        } catch (err) {
          // Do nothing
        }
      }
    }

    if (this._debug) {
      console.time('> [debug] Computing hashes')
    }

    const pkgDetails = {}
    pkgDetails.name = name

    Object.assign(pkgDetails, pkg)

    const hashes = await hash(files, isStatic, pkgDetails)

    if (this._debug) {
      console.timeEnd('> [debug] Computing hashes')
    }

    this._files = hashes

    const engines = nowProperties.engines || pkg.engines

    const deployment = await this.retry(async bail => {
      if (this._debug) {
        console.time('> [debug] /now/create')
      }

      const res = await this._fetch('/now/create', {
        method: 'POST',
        body: {
          env,
          public: wantsPublic,
          forceNew,
          forceSync,
          name,
          description,
          deploymentType,
          registryAuthToken: authToken,
          // Flatten the array to contain files to sync where each nested input
          // array has a group of files with the same sha but different path
          files: Array.prototype.concat.apply([], Array.from(this._files).map(([sha, {data, names}]) => {
            return names.map(n => {
              if (this._static && toRelative(n, this._path) !== 'package.json') {
                n = this.pathInsideContent(n)
              }

              return {
                sha,
                size: data.length,
                file: toRelative(n, this._path)
              }
            })
          })),
          engines
        }
      })

      if (this._debug) {
        console.timeEnd('> [debug] /now/create')
      }

      // no retry on 4xx
      let body
      try {
        body = await res.json()
      } catch (err) {
        throw new Error('Unexpected response')
      }

      if (res.status === 429) {
        return bail(responseError(res))
      } else if (res.status >= 400 && res.status < 500) {
        const err = new Error(body.error.message)
        err.userError = true
        return bail(err)
      } else if (res.status !== 200) {
        throw new Error(body.error.message)
      }

      return body
    })

    // we report about files whose sizes are too big
    let missingVersion = false
    if (deployment.warnings) {
      let sizeExceeded = 0
      deployment.warnings.forEach(warning => {
        if (warning.reason === 'size_limit_exceeded') {
          const {sha, limit} = warning
          const n = hashes.get(sha).names.pop()
          console.error('> \u001b[31mWarning!\u001b[39m Skipping file %s (size exceeded %s)',
            n,
            bytes(limit)
          )
          hashes.get(sha).names.unshift(n) // move name (hack, if duplicate matches we report them in order)
          sizeExceeded++
        } else if (warning.reason === 'node_version_not_found') {
          const {wanted, used} = warning
          console.error('> \u001b[31mWarning!\u001b[39m Requested node version %s is not available',
            wanted,
            used
          )
          missingVersion = true
        }
      })

      if (sizeExceeded) {
        console.error(`> \u001b[31mWarning!\u001b[39m ${sizeExceeded} of the files ` +
          'exceeded the limit for your plan.\n' +
          `> See ${chalk.underline('https://zeit.co/account')} to upgrade.`)
      }
    }

    if (!quiet && deploymentType === 'npm' && deployment.nodeVersion) {
      if (engines && engines.node) {
        if (missingVersion) {
          console.log(`> Using Node.js ${chalk.bold(deployment.nodeVersion)} (default)`)
        } else {
          console.log(`> Using Node.js ${chalk.bold(deployment.nodeVersion)} (requested: ${chalk.dim(`\`${engines.node}\``)})`)
        }
      } else {
        console.log(`> Using Node.js ${chalk.bold(deployment.nodeVersion)} (default)`)
      }
    }

    this._id = deployment.deploymentId
    this._host = deployment.url
    this._missing = deployment.missing || []

    return this._url
  }

  pathInsideContent(position) {
    const relativePath = toRelative(position, this._path)
    const contentDir = joinPaths(this._path, 'content')
    const newPath = joinPaths(contentDir, relativePath)

    return newPath
  }

  upload() {
    const parts = splitArray(this._missing, MAX_CONCURRENT)

    if (this._debug) {
      console.log('> [debug] Will upload ' +
        `${this._missing.length} files in ${parts.length} ` +
        `steps of ${MAX_CONCURRENT} uploads.`)
    }

    const uploadChunk = () => {
      Promise.all(parts.shift().map(sha => retry(async (bail, attempt) => {
        const file = this._files.get(sha)
        const {data, names} = file

        if (this._debug) {
          console.time(`> [debug] /sync #${attempt} ${names.join(' ')}`)
        }

        const stream = resumer().queue(data).end()
        const res = await this._fetch('/now/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': data.length,
            'x-now-deployment-id': this._id,
            'x-now-sha': sha,
            'x-now-file': names.map(name => {
              if (this._static) {
                name = this.pathInsideContent(name)
              }

              return toRelative(encodeURIComponent(name), this._path)
            }).join(','),
            'x-now-size': data.length
          },
          body: stream
        })

        if (this._debug) {
          console.timeEnd(`> [debug] /sync #${attempt} ${names.join(' ')}`)
        }

        // no retry on 4xx
        if (res.status !== 200 && (res.status >= 400 || res.status < 500)) {
          if (this._debug) {
            console.log('> [debug] bailing on creating due to %s', res.status)
          }

          return bail(responseError(res))
        }

        this.emit('upload', file)
      }, {retries: 3, randomize: true, onRetry: this._onRetry})))
      .then(() => parts.length ? uploadChunk() : this.emit('complete'))
      .catch(err => this.emit('error', err))
    }

    uploadChunk()
  }

  async listSecrets() {
    return this.retry(async (bail, attempt) => {
      if (this._debug) {
        console.time(`> [debug] #${attempt} GET /secrets`)
      }

      const res = await this._fetch('/now/secrets')

      if (this._debug) {
        console.timeEnd(`> [debug] #${attempt} GET /secrets`)
      }

      const body = await res.json()
      return body.secrets
    })
  }

  async list(app) {
    const query = app ? `?app=${encodeURIComponent(app)}` : ''

    const {deployments} = await this.retry(async bail => {
      if (this._debug) {
        console.time('> [debug] /list')
      }

      const res = await this._fetch('/now/list' + query)

      if (this._debug) {
        console.timeEnd('> [debug] /list')
      }

      // no retry on 4xx
      if (res.status >= 400 && res.status < 500) {
        if (this._debug) {
          console.log('> [debug] bailing on listing due to %s', res.status)
        }
        return bail(responseError(res))
      }

      if (res.status !== 200) {
        throw new Error('Fetching deployment list failed')
      }

      return res.json()
    }, {retries: 3, minTimeout: 2500, onRetry: this._onRetry})

    return deployments
  }

  async listAliases(deploymentId) {
    return this.retry(async () => {
      const res = await this._fetch(deploymentId ? `/now/deployments/${deploymentId}/aliases` : '/now/aliases')
      const body = await res.json()
      return body.aliases
    })
  }

  async last(app) {
    const deployments = await this.list(app)

    const last = deployments.sort((a, b) => {
      return b.created - a.created
    }).shift()

    if (!last) {
      const e = Error(`No deployments found for "${app}"`)
      e.userError = true
      throw e
    }

    return last
  }

  async listDomains() {
    return this.retry(async (bail, attempt) => {
      if (this._debug) {
        console.time(`> [debug] #${attempt} GET /domains`)
      }

      const res = await this._fetch('/domains')

      if (this._debug) {
        console.timeEnd(`> [debug] #${attempt} GET /domains`)
      }

      const body = await res.json()
      return body.domains
    })
  }

  async getDomain(domain) {
    return this.retry(async (bail, attempt) => {
      if (this._debug) {
        console.time(`> [debug] #${attempt} GET /domains/${domain}`)
      }

      const res = await this._fetch(`/domains/${domain}`)

      if (this._debug) {
        console.timeEnd(`> [debug] #${attempt} GET /domains/${domain}`)
      }

      return await res.json()
    })
  }

  getNameservers(domain) {
    return new Promise((resolve, reject) => {
      let fallback = false

      this.retry(async (bail, attempt) => {
        if (this._debug) {
          console.time(`> [debug] #${attempt} GET /whois-ns${fallback ? '-fallback' : ''}`)
        }

        const res = await this._fetch(`/whois-ns${fallback ? '-fallback' : ''}?domain=${encodeURIComponent(domain)}`)

        if (this._debug) {
          console.timeEnd(`> [debug] #${attempt} GET /whois-ns${fallback ? '-fallback' : ''}`)
        }

        const body = await res.json()

        if (res.status === 200) {
          if ((!body.nameservers || body.nameservers.length === 0) && !fallback) {
            // if the nameservers are `null` it's likely
            // that our whois service failed to parse it
            fallback = true
            throw new Error('Invalid whois response')
          }

          return body
        }

        if (attempt > 1) {
          fallback = true
        }

        throw new Error(`Whois error (${res.status}): ${body.error.message}`)
      }).then(body => {
        body.nameservers = body.nameservers.filter(ns => {
          // temporary hack:
          // sometimes we get a response that looks like:
          // ['ns', 'ns', '', '']
          // so we filter the empty ones
          return ns.length
        })
        resolve(body)
      }).catch(err => {
        reject(err)
      })
    })
  }

  // _ensures_ the domain is setup (idempotent)
  setupDomain(name, {isExternal} = {}) {
    return this.retry(async (bail, attempt) => {
      if (this._debug) {
        console.time(`> [debug] #${attempt} POST /domains`)
      }

      const res = await this._fetch('/domains', {
        method: 'POST',
        body: {name, isExternal: Boolean(isExternal)}
      })

      if (this._debug) {
        console.timeEnd(`> [debug] #${attempt} POST /domains`)
      }

      const body = await res.json()

      if (res.status === 403) {
        const code = body.error.code
        let err

        if (code === 'custom_domain_needs_upgrade') {
          err = new Error(`Custom domains are only enabled for premium accounts. Please upgrade at ${chalk.underline('https://zeit.co/account')}.`)
        } else {
          err = new Error(`Not authorized to access domain ${name}`)
        }

        err.userError = true
        return bail(err)
      }

      // domain already exists
      if (res.status === 409) {
        if (this._debug) {
          console.log('> [debug] Domain already exists (noop)')
        }

        return {uid: body.error.uid, code: body.error.code}
      }

      if (res.status !== 200) {
        throw new Error(body.error.message)
      }

      return body
    })
  }

  createCert(domain, {renew} = {}) {
    return this.retry(async (bail, attempt) => {
      if (this._debug) {
        console.time(`> [debug] /now/certs #${attempt}`)
      }

      const res = await this._fetch('/now/certs', {
        method: 'POST',
        body: {
          domains: [domain],
          renew
        }
      })

      if (res.status === 304) {
        console.log('> Certificate already issued.')
        return
      }

      const body = await res.json()

      if (this._debug) {
        console.timeEnd(`> [debug] /now/certs #${attempt}`)
      }

      if (body.error) {
        const {code} = body.error

        if (code === 'verification_failed') {
          const err = new Error('The certificate issuer failed to verify ownership of the domain. ' +
            'This likely has to do with DNS propagation and caching issues. Please retry later!')
          err.userError = true
          // retry
          throw err
        } else if (code === 'rate_limited') {
          const err = new Error(body.error.message)
          err.userError = true
          // dont retry
          return bail(err)
        }

        throw new Error(body.error.message)
      }

      if (res.status !== 200 && res.status !== 304) {
        throw new Error('Unhandled error')
      }
      return body
    }, {retries: 5, minTimeout: 30000, maxTimeout: 90000})
  }

  deleteCert(domain) {
    return this.retry(async (bail, attempt) => {
      if (this._debug) {
        console.time(`> [debug] /now/certs #${attempt}`)
      }

      const res = await this._fetch(`/now/certs/${domain}`, {
        method: 'DELETE'
      })

      if (res.status !== 200) {
        const err = new Error(res.body.error.message)
        err.userError = false

        if (res.status === 400 || res.status === 404) {
          return bail(err)
        }

        throw err
      }
    })
  }

  async remove(deploymentId, {hard}) {
    const data = {deploymentId, hard}

    await this.retry(async bail => {
      if (this._debug) {
        console.time('> [debug] /remove')
      }

      const res = await this._fetch('/now/remove', {
        method: 'DELETE',
        body: data
      })

      if (this._debug) {
        console.timeEnd('> [debug] /remove')
      }

      // no retry on 4xx
      if (res.status >= 400 && res.status < 500) {
        if (this._debug) {
          console.log('> [debug] bailing on removal due to %s', res.status)
        }
        return bail(responseError(res))
      }

      if (res.status !== 200) {
        throw new Error('Removing deployment failed')
      }
    })

    return true
  }

  retry(fn, {retries = 3, maxTimeout = Infinity} = {}) {
    return retry(fn, {
      retries,
      maxTimeout,
      onRetry: this._onRetry
    })
  }

  _onRetry(err) {
    if (this._debug) {
      console.log(`> [debug] Retrying: ${err.stack}`)
    }
  }

  close() {
    this._agent.close()
  }

  get id() {
    return this._id
  }

  get url() {
    return `https://${this._host}`
  }

  get host() {
    return this._host
  }

  get syncAmount() {
    if (!this._syncAmount) {
      this._syncAmount = this._missing
      .map(sha => this._files.get(sha).data.length)
      .reduce((a, b) => a + b, 0)
    }
    return this._syncAmount
  }

  _fetch(_url, opts = {}) {
    opts.headers = opts.headers || {}
    opts.headers.authorization = `Bearer ${this._token}`
    opts.headers['user-agent'] = ua
    return this._agent.fetch(_url, opts)
  }
}

function toRelative(path, base) {
  const fullBase = base.endsWith(SEP) ? base : base + SEP
  let relative = path.substr(fullBase.length)

  if (relative.startsWith(SEP)) {
    relative = relative.substr(1)
  }

  return relative.replace(/\\/g, '/')
}

function responseError(res) {
  const err = new Error('Response error')
  err.status = res.status

  if (res.status === 429) {
    const retryAfter = res.headers.get('Retry-After')
    if (retryAfter) {
      err.retryAfter = parseInt(retryAfter, 10)
    }
  }

  return err
}
