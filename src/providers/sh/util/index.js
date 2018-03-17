// Native
const { homedir } = require('os')
const { resolve: resolvePath, join, basename } = require('path')
const EventEmitter = require('events')
const qs = require('querystring')
const { parse: parseUrl } = require('url')

// Packages
const fetch = require('node-fetch')
const bytes = require('bytes')
const chalk = require('chalk')
const through2 = require('through2')
const retry = require('async-retry')
const { parse: parseIni } = require('ini')
const { readFile, stat, lstat } = require('fs-extra')
const ms = require('ms')

// Utilities
const {
  staticFiles: getFiles,
  npm: getNpmFiles,
  docker: getDockerFiles
} = require('./get-files')
const Agent = require('./agent')
const toHost = require('./to-host')
const { responseError } = require('./error')
const ua = require('./ua')
const hash = require('./hash')
const cmd = require('../../../util/output/cmd')
const createOutput = require('../../../util/output')

// How many concurrent HTTP/2 stream uploads
const MAX_CONCURRENT = 50

// Check if running windows
const IS_WIN = process.platform.startsWith('win')
const SEP = IS_WIN ? '\\' : '/'

module.exports = class Now extends EventEmitter {
  constructor({ apiUrl, token, currentTeam, forceNew = false, debug = false }) {
    super()

    this._token = token
    this._debug = debug
    this._forceNew = forceNew
    this._output = createOutput({ debug })
    this._agent = new Agent(apiUrl, { debug })
    this._onRetry = this._onRetry.bind(this)
    this.currentTeam = currentTeam
  }

  async create(
    paths,
    {
      wantsPublic,
      quiet = false,
      env = {},
      followSymlinks = true,
      forceNew = false,
      forwardNpm = false,
      scale = {},

      // From readMetaData
      name,
      description,
      type = 'npm',
      pkg = {},
      nowConfig = {},
      hasNowJson = false,
      sessionAffinity = 'ip',
      isFile = false
    }
  ) {
    const { log, warn, time } = this._output

    let files = []
    let relatives = {}
    let engines

    await time('Getting files', async () => {
      const opts = { output: this._output, hasNowJson }

      if (type === 'npm') {
        files = await getNpmFiles(paths[0], pkg, nowConfig, opts)

        // A `start` or `now-start` npm script, or a `server.js` file
        // in the root directory of the deployment are required
        if (!hasNpmStart(pkg) && !hasFile(paths[0], files, 'server.js')) {
          const err = new Error(
            'Missing `start` (or `now-start`) script in `package.json`. ' +
              'See: https://docs.npmjs.com/cli/start'
          )
          err.userError = true
          throw err
        }

        engines = nowConfig.engines || pkg.engines
        forwardNpm = forwardNpm || nowConfig.forwardNpm
      } else if (type === 'static') {
        if (isFile) {
          files = [resolvePath(paths[0])]
        } else if (paths.length === 1) {
          files = await getFiles(paths[0], nowConfig, opts)
        } else {
          if (!files) {
            files = []
          }

          for (const path of paths) {
            const list = await getFiles(path, {}, opts)
            files = files.concat(list)

            for (const file of list) {
              relatives[file] = path
            }
          }
        }
      } else if (type === 'docker') {
        files = await getDockerFiles(paths[0], nowConfig, opts)
      }
    })

    // Read `registry.npmjs.org` authToken from .npmrc
    let authToken

    if (type === 'npm' && forwardNpm) {
      authToken =
        (await readAuthToken(paths[0])) || (await readAuthToken(homedir()))
    }

    const hashes = await time('Computing hashes', () => {
      const pkgDetails = Object.assign({ name }, pkg)
      return hash(files, pkgDetails)
    })

    this._files = hashes

    const deployment = await this.retry(async bail => {
      // Flatten the array to contain files to sync where each nested input
      // array has a group of files with the same sha but different path
      const files = await time(
        'Get files ready for deployment',
        Promise.all(
          Array.prototype.concat.apply(
            [],
            await Promise.all(
              Array.from(this._files).map(async ([sha, { data, names }]) => {
                const statFn = followSymlinks ? stat : lstat

                return names.map(async name => {
                  const getMode = async () => {
                    const st = await statFn(name)
                    return st.mode
                  }

                  const mode = await getMode()
                  const multipleStatic = Object.keys(relatives).length !== 0

                  let file

                  if (isFile) {
                    file = basename(paths[0])
                  } else if (multipleStatic) {
                    file = toRelative(name, join(relatives[name], '..'))
                  } else {
                    file = toRelative(name, paths[0])
                  }

                  return {
                    sha,
                    size: data.length,
                    file,
                    mode
                  }
                })
              })
            )
          )
        )
      )

      const res = await time(
        'POST /v3/now/deployments',
        this._fetch('/v3/now/deployments', {
          method: 'POST',
          body: {
            env,
            public: wantsPublic || nowConfig.public,
            forceNew,
            name,
            description,
            deploymentType: type,
            registryAuthToken: authToken,
            files,
            engines,
            scale,
            sessionAffinity,
            atlas: hasNowJson && Boolean(nowConfig.atlas)
          }
        })
      )

      // No retry on 4xx
      let body

      try {
        body = await res.json()
      } catch (err) {
        throw new Error('Unexpected response')
      }

      if (res.status === 429) {
        let msg = `You reached your 20 deployments limit in the OSS plan.\n`
        msg += `Please run ${cmd('now upgrade')} to proceed`
        const err = new Error(msg)

        err.status = res.status
        err.retryAfter = 'never'

        return bail(err)
      }

      if (
        res.status === 400 &&
        body.error &&
        body.error.code === 'missing_files'
      ) {
        return body
      }

      if (res.status >= 400 && res.status < 500) {
        const err = new Error()

        if (body.error) {
          if (body.error.code === 'env_value_invalid_type') {
            const { key } = body.error
            err.message =
              `The env key ${key} has an invalid type: ${typeof env[key]}. ` +
              'Please supply a String or a Number (https://err.sh/now-cli/env-value-invalid-type)'
          } else {
            Object.assign(err, body.error)
          }
        } else {
          err.message = 'Not able to create deployment'
        }

        err.userError = true
        return bail(err)
      }

      if (res.status !== 200) {
        throw new Error(body.error.message)
      }

      return body
    })

    // We report about files whose sizes are too big
    let missingVersion = false

    if (deployment.warnings) {
      let sizeExceeded = 0

      deployment.warnings.forEach(warning => {
        if (warning.reason === 'size_limit_exceeded') {
          const { sha, limit } = warning
          const n = hashes.get(sha).names.pop()

          warn(`Skipping file ${n} (size exceeded ${bytes(limit)}`)

          hashes.get(sha).names.unshift(n) // Move name (hack, if duplicate matches we report them in order)
          sizeExceeded++
        } else if (warning.reason === 'node_version_not_found') {
          warn(`Requested node version ${warning.wanted} is not available`)
          missingVersion = true
        }
      })

      if (sizeExceeded > 0) {
        warn(`${sizeExceeded} of the files exceeded the limit for your plan.`)
        log(`Please run ${cmd('now upgrade')} to upgrade.`)
      }
    }

    if (deployment.error && deployment.error.code === 'missing_files') {
      this._missing = deployment.error.missing || []
      this._fileCount = files.length

      return null
    }

    if (!quiet && type === 'npm' && deployment.nodeVersion) {
      if (engines && engines.node && !missingVersion) {
        log(chalk`Using Node.js {bold ${
          deployment.nodeVersion}} (requested: {dim \`${engines.node}\`})`)
      } else {
        log(chalk`Using Node.js {bold ${deployment.nodeVersion}} (default)`)
      }
    }

    this._id = deployment.deploymentId
    this._host = deployment.url
    this._missing = []
    this._fileCount = files.length

    return deployment
  }

  upload() {
    const { debug, time } = this._output
    debug(`Will upload ${this._missing.length} files`)

    this._agent.setConcurrency({
      maxStreams: MAX_CONCURRENT,
      capacity: this._missing.length
    })

    time('Uploading files', Promise.all(
      this._missing.map(sha =>
        retry(
          async (bail, attempt) => {
            const file = this._files.get(sha)
            const { data, names } = file
            const stream = through2()

            stream.write(data)
            stream.end()

            const res = await time(
              `POST /v2/now/files #${attempt} ${names.join(' ')}`,
              this._fetch('/v2/now/files', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/octet-stream',
                  'Content-Length': data.length,
                  'x-now-digest': sha,
                  'x-now-size': data.length
                },
                body: stream
              })
            )

            if (res.status === 200) {
              // What we want
              this.emit('upload', file)
            } else if (res.status > 200 && res.status < 500) {
              // If something is wrong with our request, we don't retry
              return bail(await responseError(res, 'Failed to upload file'))
            } else {
              // If something is wrong with the server, we retry
              throw await responseError(res, 'Failed to upload file')
            }
          },
          {
            retries: 3,
            randomize: true,
            onRetry: this._onRetry
          }
        )
      )
    ))
      .then(() => {
        this.emit('complete')
      })
      .catch(err => this.emit('error', err))
  }

  async listSecrets() {
    const { time } = this._output

    const { secrets } = await this.retry(async (bail, attempt) => {
      const res = await time(
        `#${attempt} GET /secrets`,
        this._fetch('/now/secrets')
      )

      if (res.status === 200) {
        // What we want
        return res.json()
      } else if (res.status > 200 && res.status < 500) {
        // If something is wrong with our request, we don't retry
        return bail(await responseError(res, 'Failed to list secrets'))
      } else {
        // If something is wrong with the server, we retry
        throw await responseError(res, 'Failed to list secrets')
      }
    })

    return secrets
  }

  async list(app) {
    const { time } = this._output
    const query = app ? `?app=${encodeURIComponent(app)}` : ''

    const { deployments } = await this.retry(
      async bail => {
        const res = await time(
          'GET /v2/now/deployments',
          this._fetch('/v2/now/deployments' + query)
        )

        if (res.status === 200) {
          // What we want
          return res.json()
        } else if (res.status > 200 && res.status < 500) {
          // If something is wrong with our request, we don't retry
          return bail(await responseError(res, 'Failed to list deployments'))
        } else {
          // If something is wrong with the server, we retry
          throw await responseError(res, 'Failed to list deployments')
        }
      },
      {
        retries: 3,
        minTimeout: 2500,
        onRetry: this._onRetry
      }
    )

    return deployments
  }

  async listInstances(deploymentId) {
    const { time } = this._output

    const { instances } = await this.retry(
      async bail => {
        const res = await time(
          `/deployments/${deploymentId}/instances`,
          this._fetch(`/now/deployments/${deploymentId}/instances`)
        )

        if (res.status === 200) {
          // What we want
          return res.json()
        } else if (res.status > 200 && res.status < 500) {
          // If something is wrong with our request, we don't retry
          return bail(await responseError(res, 'Failed to list instances'))
        } else {
          // If something is wrong with the server, we retry
          throw await responseError(res, 'Failed to list instances')
        }
      },
      {
        retries: 3,
        minTimeout: 2500,
        onRetry: this._onRetry
      }
    )

    return instances
  }

  async findDeployment(deployment) {
    const { debug } = this._output
    const list = await this.list()

    let key
    let val

    if (/\./.test(deployment)) {
      val = toHost(deployment)
      key = 'url'
    } else {
      val = deployment
      key = 'uid'
    }

    const depl = list.find(d => {
      if (d[key] === val) {
        debug(`Matched deployment ${d.uid} by ${key} ${val}`)
        return true
      }

      // Match prefix
      if (`${val}.now.sh` === d.url) {
        debug(`Matched deployment ${d.uid} by url ${d.url}`)
        return true
      }

      return false
    })

    return depl
  }

  async logs(
    deploymentIdOrURL,
    { instanceId, types, limit, query, since, until } = {}
  ) {
    const { time } = this._output

    const q = qs.stringify({
      instanceId,
      types: types.join(','),
      limit,
      q: query,
      since,
      until
    })

    const { logs } = await this.retry(
      async bail => {
        const url = `/now/deployments/${encodeURIComponent(
          deploymentIdOrURL
        )}/logs?${q}`

        const res = await time('GET /logs', this._fetch(url))

        if (res.status === 200) {
          // What we want
          return res.json()
        } else if (res.status > 200 && res.status < 500) {
          // If something is wrong with our request, we don't retry
          return bail(await responseError(res, 'Failed to fetch deployment logs'))
        } else {
          // If something is wrong with the server, we retry
          throw await responseError(res, 'Failed to fetch deployment logs')
        }
      },
      {
        retries: 3,
        minTimeout: 2500,
        onRetry: this._onRetry
      }
    )

    return logs
  }

  async listAliases(deploymentId) {
    const { aliases } = await this.retry(async bail => {
      const res = await this._fetch(
        deploymentId
          ? `/now/deployments/${deploymentId}/aliases`
          : '/now/aliases'
      )

      if (res.status === 200) {
        // What we want
        return res.json()
      } else if (res.status > 200 && res.status < 500) {
        // If something is wrong with our request, we don't retry
        return bail(await responseError(res, 'Failed to list aliases'))
      } else {
        // If something is wrong with the server, we retry
        throw await responseError(res, 'Failed to list aliases')
      }
    })

    return aliases
  }

  async last(app) {
    const deployments = await this.list(app)

    const last = deployments
      .sort((a, b) => {
        return b.created - a.created
      })
      .shift()

    if (!last) {
      const e = Error(`No deployments found for "${app}"`)
      e.userError = true
      throw e
    }

    return last
  }

  async listDomains() {
    const { time } = this._output

    const { domains } = await this.retry(async (bail, attempt) => {
      const res = await time(
        `#${attempt} GET /domains`,
        this._fetch('/domains')
      )

      if (res.status === 200) {
        // What we want
        return res.json()
      } else if (res.status > 200 && res.status < 500) {
        // If something is wrong with our request, we don't retry
        return bail(await responseError(res, 'Failed to list domains'))
      } else {
        // If something is wrong with the server, we retry
        throw await responseError(res, 'Failed to list domains')
      }
    })

    return domains
  }

  async getDomain(domain) {
    const { time } = this._output

    return this.retry(async (bail, attempt) => {
      const res = await time(
        `#${attempt} GET /domains/${domain}`,
        this._fetch(`/domains/${domain}`)
      )

      if (res.status === 200) {
        // What we want
        return res.json()
      } else if (res.status > 200 && res.status < 500) {
        // If something is wrong with our request, we don't retry
        return bail(await responseError(res, 'Failed to fetch domain'))
      } else {
        // If something is wrong with the server, we retry
        throw await responseError(res, 'Failed to fetch domain')
      }
    })
  }

  async getNameservers(domain) {
    const { time } = this._output

    const body = await this.retry(async (bail, attempt) => {
      const res = await time(
        `#${attempt} GET /whois-ns`,
        this._fetch(`/whois-ns?domain=${encodeURIComponent(domain)}`)
      )

      const body = await res.json()

      if (res.status === 200) {
        return body
      }

      throw new Error(`Whois error (${res.status}): ${body.error.message}`)
    })

    body.nameservers = body.nameservers.filter(ns => {
      // Temporary hack:
      // sometimes we get a response that looks like:
      // ['ns', 'ns', '', '']
      // so we filter the empty ones
      return ns.length > 0
    })

    return body
  }

  // _ensures_ the domain is setup (idempotent)
  setupDomain(name, { isExternal } = {}) {
    const { debug, time } = this._output

    return this.retry(async (bail, attempt) => {
      const res = await time(
        `#${attempt} POST /domains`,
        this._fetch('/domains', {
          method: 'POST',
          body: { name, isExternal: Boolean(isExternal) }
        })
      )

      const body = await res.json()

      if (res.status === 403) {
        const code = body.error.code
        let err
        if (code === 'custom_domain_needs_upgrade') {
          err = new Error(
            `Custom domains are only enabled for premium accounts. ` +
              chalk`Please upgrade at {underline https://zeit.co/account}`
          )
        } else {
          err = new Error(
            `Not authorized to access domain ${name} http://err.sh/now-cli/unauthorized-domain`
          )
        }
        err.userError = true
        return bail(err)
      } else if (res.status === 409) {
        // Domain already exists
        debug('Domain already exists (noop)')
        return { uid: body.error.uid, code: body.error.code }
      } else if (
        res.status === 401 &&
        body.error &&
        body.error.code === 'verification_failed'
      ) {
        throw new Error(body.error.message)
      } else if (res.status !== 200) {
        throw new Error(body.error.message)
      }

      return body
    })
  }

  createCert(domain, { renew, overwriteCustom } = {}) {
    const { log, time } = this._output

    return this.retry(
      async (bail, attempt) => {
        const res = await time(
          `/now/certs #${attempt}`,
          this._fetch('/now/certs', {
            method: 'POST',
            body: {
              domains: [domain],
              renew,
              overwriteCustom
            }
          })
        )

        if (res.status === 304) {
          log('Certificate already issued.')
          return
        }

        const body = await res.json()

        if (body.error) {
          const { code } = body.error

          if (code === 'verification_failed') {
            const err = new Error(
              'The certificate issuer failed to verify ownership of the domain. ' +
                'This likely has to do with DNS propagation and caching issues. Please retry later!'
            )
            err.userError = true
            // Retry
            throw err
          } else if (code === 'rate_limited') {
            const err = new Error(body.error.message)
            err.userError = true
            // Dont retry
            return bail(err)
          }

          throw new Error(body.error.message)
        }

        if (res.status !== 200 && res.status !== 304) {
          throw new Error('Unhandled error')
        }

        return body
      },
      {
        retries: 3,
        minTimeout: 30000,
        maxTimeout: 90000
      }
    )
  }

  deleteCert(domain) {
    const { time } = this._output

    return this.retry(
      async (bail, attempt) => {
        const res = await time(
          `/now/certs #${attempt}`,
          this._fetch(`/now/certs/${domain}`, {
            method: 'DELETE'
          })
        )

        if (res.status !== 200) {
          const err = new Error(res.body.error.message)
          err.userError = false

          if (res.status === 400 || res.status === 404) {
            return bail(err)
          }

          throw err
        }
      },
      { retries: 3 }
    )
  }

  async remove(deploymentId, { hard }) {
    const { time } = this._output
    const url = `/now/deployments/${deploymentId}?hard=${hard ? 1 : 0}`

    await this.retry(async bail => {
      const res = await time(
        `DELETE ${url}`,
        this._fetch(url, {
          method: 'DELETE'
        })
      )

      if (res.status === 200) {
        // What we want
        return
      } else if (res.status > 200 && res.status < 500) {
        // If something is wrong with our request, we don't retry
        return bail(await responseError(res, 'Failed to remove deployment'))
      } else {
        // If something is wrong with the server, we retry
        throw await responseError(res, 'Failed to fetch domain')
      }
    })

    return true
  }

  retry(fn, { retries = 3, maxTimeout = Infinity } = {}) {
    return retry(fn, {
      retries,
      maxTimeout,
      onRetry: this._onRetry
    })
  }

  _onRetry(err) {
    this._output.debug(`Retrying: ${err}\n${err.stack}`)
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

  get fileCount() {
    return this._fileCount
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

  get syncFileCount() {
    return this._missing.length
  }

  _fetch(_url, opts = {}) {
    if (opts.useCurrentTeam !== false && this.currentTeam) {
      const parsedUrl = parseUrl(_url, true)
      const query = parsedUrl.query

      query.teamId = this.currentTeam.id
      _url = `${parsedUrl.pathname}?${qs.encode(query)}`
      delete opts.useCurrentTeam
    }

    opts.headers = opts.headers || {}
    opts.headers.authorization = `Bearer ${this._token}`
    opts.headers['user-agent'] = ua

    return this._agent.fetch(_url, opts)
  }

  setScale(nameOrId, scale) {
    const { time } = this._output

    return this.retry(
      async (bail, attempt) => {
        const res = await time(
          `#${attempt} POST /deployments/${nameOrId}/instances`,
          this._fetch(`/now/deployments/${nameOrId}/instances`, {
            method: 'POST',
            body: scale
          })
        )

        if (res.status === 403) {
          return bail(new Error('Unauthorized'))
        }

        const body = await res.json()

        if (res.status !== 200) {
          if (res.status === 404 || res.status === 400) {
            if (
              body &&
              body.error &&
              body.error.code &&
              body.error.code === 'not_snapshotted'
            ) {
              throw new Error(body.error.message)
            }
            const err = new Error(body.error.message)
            err.userError = true
            return bail(err)
          }

          if (body.error && body.error.message) {
            const err = new Error(body.error.message)
            err.userError = true
            return bail(err)
          }
          throw new Error(
            `Error occurred while scaling. Please try again later`
          )
        }

        return body
      },
      {
        retries: 300,
        maxTimeout: ms('5s'),
        factor: 1.1
      }
    )
  }

  async unfreeze(depl) {
    return this.retry(async bail => {
      const res = await fetch(`https://${depl.url}`)

      if ([500, 502, 503].includes(res.status)) {
        const err = new Error('Unfreeze failed. Try again later.')
        bail(err)
      }
    })
  }

  async getPlanMax() {
    return 10
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

function hasNpmStart(pkg) {
  return pkg.scripts && (pkg.scripts.start || pkg.scripts['now-start'])
}

function hasFile(base, files, name) {
  const relative = files.map(file => toRelative(file, base))
  return relative.indexOf(name) !== -1
}

async function readAuthToken(path, name = '.npmrc') {
  try {
    const contents = await readFile(resolvePath(path, name), 'utf8')
    const npmrc = parseIni(contents)
    return npmrc['//registry.npmjs.org/:_authToken']
  } catch (err) {
    // Do nothing
  }
}
