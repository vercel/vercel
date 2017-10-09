// Packages
const fetch = require('node-fetch')
const loadJSON = require('load-json-file')
const publicSuffixList = require('psl')
const mri = require('mri')
const ms = require('ms')
const chalk = require('chalk')
const { write: copy } = require('clipboardy')

// Ours
const promptBool = require('../../../util/input/prompt-bool')
const info = require('../../../util/output/info')
const param = require('../../../util/output/param')
const wait = require('../../../util/output/wait')
const success = require('../../../util/output/success')
const uid = require('../../../util/output/uid')
const eraseLines = require('../../../util/output/erase-lines')
const stamp = require('../../../util/output/stamp')
const error = require('../../../util/output/error')
const treatBuyError = require('../util/domains/treat-buy-error')
const scaleInfo = require('./scale-info')
const { DOMAIN_VERIFICATION_ERROR } = require('./errors')
const isZeitWorld = require('./is-zeit-world')
const toHost = require('./to-host')
const exit = require('../../../util/exit')
const Now = require('./')

const argv = mri(process.argv.slice(2), {
  boolean: ['no-clipboard'],
  alias: { 'no-clipboard': 'C' }
})

const isTTY = process.stdout.isTTY
const clipboard = !argv['no-clipboard']
const domainRegex = /^((?=[a-z0-9-]{1,63}\.)(xn--)?[a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,63}$/

module.exports = class Alias extends Now {
  async ls(deployment) {
    if (deployment) {
      const target = await this.findDeployment(deployment)

      if (!target) {
        const err = new Error(
          `Aliases not found by "${deployment}". Run ${chalk.dim(
            '`now alias ls`'
          )} to see your aliases.`
        )
        err.userError = true
        throw err
      }

      return this.listAliases(target.uid)
    }

    return this.listAliases()
  }

  async rm(_alias) {
    return this.retry(async bail => {
      const res = await this._fetch(`/now/aliases/${_alias.uid}`, {
        method: 'DELETE'
      })

      if (res.status === 403) {
        return bail(new Error('Unauthorized'))
      }

      if (res.status !== 200) {
        const err = new Error('Deletion failed. Try again later.')
        throw err
      }
    })
  }

  async findDeployment(deployment) {
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
        if (this._debug) {
          console.log(`> [debug] matched deployment ${d.uid} by ${key} ${val}`)
        }

        return true
      }

      // Match prefix
      if (`${val}.now.sh` === d.url) {
        if (this._debug) {
          console.log(`> [debug] matched deployment ${d.uid} by url ${d.url}`)
        }

        return true
      }

      return false
    })

    return depl
  }

  async updatePathBasedroutes(alias, rules, domains) {
    alias = await this.maybeSetUpDomain(alias, domains)
    return this.upsertPathAlias(alias, rules)
  }

  async upsertPathAlias(alias, rules) {
    return this.retry(async (bail, attempt) => {
      if (this._debug) {
        console.time(`> [debug] /now/aliases #${attempt}`)
      }

      const rulesData = this.readRulesFile(rules)
      const ruleCount = rulesData.rules.length
      const res = await this._fetch(`/now/aliases`, {
        method: 'POST',
        body: { alias, rules: rulesData.rules }
      })

      const body = await res.json()
      body.ruleCount = ruleCount
      if (this._debug) {
        console.timeEnd(`> [debug] /now/aliases #${attempt}`)
      }

      // 409 conflict is returned if it already exists
      if (res.status === 409) {
        return { uid: body.error.uid }
      }
      if (res.status === 422) {
        return body
      }

      // No retry on authorization problems
      if (res.status === 403) {
        const code = body.error.code

        if (code === 'custom_domain_needs_upgrade') {
          const err = new Error(
            `Custom domains are only enabled for premium accounts. Please upgrade by running ${chalk.gray(
              '`'
            )}${chalk.cyan('now upgrade')}${chalk.gray('`')}.`
          )
          err.userError = true
          return bail(err)
        }

        if (code === 'alias_in_use') {
          const err = new Error(
            `The alias you are trying to configure (${chalk.underline(
              chalk.bold(alias)
            )}) is already in use by a different account.`
          )
          err.userError = true
          return bail(err)
        }

        if (code === 'forbidden') {
          const err = new Error(
            'The domain you are trying to use as an alias is already in use by a different account.'
          )
          err.userError = true
          return bail(err)
        }

        return bail(new Error('Authorization error'))
      }

      // All other errors
      if (body.error) {
        const code = body.error.code

        if (code === 'cert_missing') {
          console.log(
            `> Provisioning certificate for ${chalk.underline(
              chalk.bold(alias)
            )}`
          )

          try {
            await this.createCert(alias)
          } catch (err) {
            // We bail to avoid retrying the whole process
            // of aliasing which would involve too many
            // retries on certificate provisioning
            return bail(err)
          }

          // Try again, but now having provisioned the certificate
          return this.upsertPathAlias(alias, rules)
        }

        if (code === 'cert_expired') {
          console.log(
            `> Renewing certificate for ${chalk.underline(chalk.bold(alias))}`
          )

          try {
            await this.createCert(alias, { renew: true })
          } catch (err) {
            return bail(err)
          }
        }

        return bail(new Error(body.error.message))
      }

      // The two expected successful codes are 200 and 304
      if (res.status !== 200 && res.status !== 304) {
        throw new Error('Unhandled error')
      }

      return body
    })
  }

  readRulesFile(rules) {
    try {
      return loadJSON.sync(rules)
    } catch (err) {
      console.error(`Reading rules file ${rules} failed: ${err}`)
    }
  }

  async set(deployment, alias, domains, currentTeam, user) {
    alias = alias.replace(/^https:\/\//i, '')

    if (alias.endsWith('.ws')) {
      const err = new Error(
        `ZEIT.world currently does't support ${chalk.bold('.ws')} domains`
      )

      err.userError = true
      throw err
    }

    if (alias.indexOf('.') === -1) {
      // `.now.sh` domain is implied if just the subdomain is given
      alias += '.now.sh'
    }
    const depl = await this.findDeployment(deployment)
    if (!depl) {
      const err = new Error(
        `Deployment not found by "${deployment}". Run ${chalk.dim(
          '`now ls`'
        )} to see your deployments.`
      )
      err.userError = true
      throw err
    }

    const aliasDepl = (await this.listAliases()).find(e => e.alias === alias)
    if (aliasDepl && aliasDepl.rules) {
      if (isTTY) {
        try {
          const msg =
            `> Path alias exists with ${aliasDepl.rules.length} rule${aliasDepl
              .rules.length > 1
              ? 's'
              : ''}.\n` +
            `> Are you sure you want to update ${alias} to be a normal alias?\n`

          const confirmation = await promptBool(msg, {
            trailing: '\n'
          })

          if (!confirmation) {
            info('Aborted')
            return exit(1)
          }
        } catch (err) {
          console.log(err)
        }
      } else {
        console.log(
          `Overwriting path alias with ${aliasDepl.rules.length} rule${aliasDepl
            .rules.length > 1
            ? 's'
            : ''} to be a normal alias.`
        )
      }
    }

    let aliasedDeployment = null
    let shouldScaleDown = false

    if (aliasDepl && depl.scale) {
      aliasedDeployment = await this.findDeployment(aliasDepl.deploymentId)
      if (
        aliasedDeployment &&
        aliasedDeployment.scale &&
        aliasedDeployment.scale.current >= depl.scale.current &&
        (aliasedDeployment.scale.min > depl.scale.min ||
          aliasedDeployment.scale.max > depl.scale.max)
      ) {
        shouldScaleDown = true
        console.log(
          `> Alias ${alias} points to ${chalk.bold(
            aliasedDeployment.url
          )} (${chalk.bold(aliasedDeployment.scale.current + ' instances')})`
        )
        // Test if we need to change the scale or just update the rules
        console.log(
          `> Scaling ${depl.url} to ${chalk.bold(
            aliasedDeployment.scale.current + ' instances'
          )} atomically` // Not a typo
        )
        if (depl.scale.current !== aliasedDeployment.scale.current) {
          if (depl.scale.max < 1) {
            if (this._debug) {
              console.log(
                'Updating max scale to 1 so that deployment may be unfrozen.'
              )
            }
            await this.setScale(depl.uid, {
              min: depl.scale.min,
              max: Math.max(aliasedDeployment.scale.max, 1)
            })
          }
          if (depl.scale.current < 1) {
            if (this._debug) {
              console.log(`> Deployment ${depl.url} is frozen, unfreezing...`)
            }
            await this.unfreeze(depl)
            if (this._debug) {
              console.log(
                `> Deployment is now unfrozen, scaling it to match current instance count`
              )
            }
          }
          // Scale it to current limit
          if (depl.scale.current !== aliasedDeployment.scale.current) {
            if (this._debug) {
              console.log(`> Scaling deployment to match current scale.`)
            }
            await this.setScale(depl.uid, {
              min: aliasedDeployment.scale.current,
              max: aliasedDeployment.scale.current
            })
          }
          await scaleInfo(this, depl.url)
          if (this._debug) {
            console.log(`> Updating scaling rules for deployment.`)
          }
        }

        await this.setScale(depl.uid, {
          min: Math.max(aliasedDeployment.scale.min, depl.scale.min),
          max: Math.max(aliasedDeployment.scale.max, depl.scale.max)
        })
      }
    }

    alias = await this.maybeSetUpDomain(alias, domains, currentTeam, user)

    const aliasTime = Date.now()
    const newAlias = await this.createAlias(depl, alias)
    if (!newAlias) {
      throw new Error(
        `Unexpected error occurred while setting up alias: ${JSON.stringify(
          newAlias
        )}`
      )
    }
    const { created, uid } = newAlias
    if (created) {
      const output = `${chalk.cyan(
        '> Success!'
      )} ${alias} now points to ${chalk.bold(depl.url)}! ${chalk.grey(
        '[' + ms(Date.now() - aliasTime) + ']'
      )}`
      if (isTTY && clipboard) {
        try {
          await copy(depl.url)
        } catch (err) {
        } finally {
          console.log(output)
        }
      } else {
        console.log(output)
      }
    } else {
      console.log(
        `${chalk.cyan('> Success!')} Alias already exists ${chalk.dim(
          `(${uid})`
        )}.`
      )
    }
    if (aliasedDeployment && shouldScaleDown) {
      const scaleDown = Date.now()
      await this.setScale(aliasedDeployment.uid, { min: 0, max: 1 })
      console.log(
        `> Scaled ${chalk.gray(
          aliasedDeployment.url
        )} down to 1 instance ${chalk.gray(
          '[' + ms(Date.now() - scaleDown) + ']'
        )}`
      )
    }
  }

  createAlias(depl, alias) {
    return this.retry(async (bail, attempt) => {
      if (this._debug) {
        console.time(
          `> [debug] /now/deployments/${depl.uid}/aliases #${attempt}`
        )
      }

      const res = await this._fetch(`/now/deployments/${depl.uid}/aliases`, {
        method: 'POST',
        body: { alias }
      })

      const body = await res.json()
      if (this._debug) {
        console.timeEnd(
          `> [debug] /now/deployments/${depl.uid}/aliases #${attempt}`
        )
      }

      // 409 conflict is returned if it already exists
      if (res.status === 409) {
        return { uid: body.error.uid }
      }

      // No retry on authorization problems
      if (res.status === 403) {
        const code = body.error.code

        if (code === 'custom_domain_needs_upgrade') {
          const err = new Error(
            `Custom domains are only enabled for premium accounts. Please upgrade by running ${chalk.gray(
              '`'
            )}${chalk.cyan('now upgrade')}${chalk.gray('`')}.`
          )
          err.userError = true
          return bail(err)
        }

        if (code === 'alias_in_use') {
          const err = new Error(
            `The alias you are trying to configure (${chalk.underline(
              chalk.bold(alias)
            )}) is already in use by a different account.`
          )
          err.userError = true
          return bail(err)
        }

        if (code === 'forbidden') {
          const err = new Error(
            'The domain you are trying to use as an alias is already in use by a different account.'
          )
          err.userError = true
          return bail(err)
        }

        return bail(new Error('Authorization error'))
      }

      // All other errors
      if (body.error) {
        const code = body.error.code

        if (code === 'deployment_not_found') {
          return bail(new Error('Deployment not found'))
        }

        if (code === 'cert_missing') {
          console.log(
            `> Provisioning certificate for ${chalk.underline(
              chalk.bold(alias)
            )}`
          )

          try {
            await this.createCert(alias)
          } catch (err) {
            // We bail to avoid retrying the whole process
            // of aliasing which would involve too many
            // retries on certificate provisioning
            return bail(err)
          }

          // Try again, but now having provisioned the certificate
          return this.createAlias(depl, alias)
        }

        if (code === 'cert_expired') {
          console.log(
            `> Renewing certificate for ${chalk.underline(chalk.bold(alias))}`
          )

          try {
            await this.createCert(alias, { renew: true })
          } catch (err) {
            return bail(err)
          }
        }

        return bail(new Error(body.error.message))
      }

      // The two expected successful codes are 200 and 304
      if (res.status !== 200 && res.status !== 304) {
        throw new Error('Unhandled error')
      }

      return body
    })
  }

  async setupRecord(domain, name) {
    await this.setupDomain(domain)

    if (this._debug) {
      console.log(`> [debug] Setting up record "${name}" for "${domain}"`)
    }

    const type = name === '' ? 'ALIAS' : 'CNAME'
    return this.retry(async (bail, attempt) => {
      if (this._debug) {
        console.time(`> [debug] /domains/${domain}/records #${attempt}`)
      }

      const res = await this._fetch(`/domains/${domain}/records`, {
        method: 'POST',
        body: { type, name: name === '' ? name : '*', value: 'alias.zeit.co' }
      })

      if (this._debug) {
        console.timeEnd(`> [debug] /domains/${domain}/records #${attempt}`)
      }

      if (res.status === 403) {
        return bail(new Error('Unauthorized'))
      }

      const body = await res.json()

      if (res.status === 409 && body.error.code === 'record_conflict') {
        if (this._debug) {
          console.log(`> [debug] ${body.error.oldId} is a conflicting record for "${name}"`)
        }
        return
      }

      if (res.status !== 200) {
        throw new Error(body.error.message)
      }

      return
    })
  }

  async maybeSetUpDomain(alias, domains, currentTeam, user) {
    const gracefulExit = () => {
      this.close()
      domains.close()
      // eslint-disable-next-line unicorn/no-process-exit
      process.exit()
    }
    // Make alias lowercase
    alias = alias.toLowerCase()

    // Trim leading and trailing dots
    // for example: `google.com.` => `google.com`
    alias = alias.replace(/^\.+/, '').replace(/\.+$/, '')
    // Evaluate the alias
    if (/\./.test(alias)) {
      alias = toHost(alias)
    } else {
      if (this._debug) {
        console.log(`> [debug] suffixing \`.now.sh\` to alias ${alias}`)
      }

      alias = `${alias}.now.sh`
    }

    if (!domainRegex.test(alias)) {
      const err = new Error(`Invalid alias "${alias}"`)
      err.userError = true
      throw err
    }

    if (!/\.now\.sh$/.test(alias)) {
      console.log(`> ${chalk.bold(chalk.underline(alias))} is a custom domain.`)

      let stopSpinner = wait('Fetching domain info')

      let elapsed = stamp()
      const parsed = publicSuffixList.parse(alias)
      const pricePromise = domains.price(parsed.domain).catch(() => {
        // Can be safely ignored
      })
      const canBePurchased = await domains.status(parsed.domain)
      const aliasParam = param(parsed.domain)
      let price
      let period

      stopSpinner()

      if (canBePurchased) {
        try {
          const json = await pricePromise
          price = json.price
          period = json.period
        } catch (err) {
          // Can be safely ignored
        }
      }
      if (canBePurchased && price && period) {
        const periodMsg = `${period}yr${period > 1 ? 's' : ''}`
        info(
          `The domain ${aliasParam} is ${chalk.italic(
            'available'
          )} to buy under ${chalk.bold(
            (currentTeam && currentTeam.slug) || user.username || user.email
          )}! ${elapsed()}`
        )
        const confirmation = await promptBool(
          `Buy now for ${chalk.bold(`$${price}`)} (${periodMsg})?`
        )
        eraseLines(1)
        if (!confirmation) {
          info('Aborted')
          gracefulExit()
        }
        elapsed = stamp()
        stopSpinner = wait('Purchasing')
        let domain
        try {
          domain = await domains.buy(parsed.domain)
        } catch (err) {
          stopSpinner()
          treatBuyError(err)
          gracefulExit()
        }

        stopSpinner()
        success(`Domain purchased and created ${uid(domain.uid)} ${elapsed()}`)

        stopSpinner = wait('Verifying nameservers')

        let domainInfo

        try {
          domainInfo = await this.setupDomain(parsed.domain)
        } catch (err) {
          if (this._debug) {
            console.log('> [debug] Error while trying to setup the domain', err)
          }
        }

        stopSpinner()

        if (!domainInfo.verified) {
          const tld = param(`.${parsed.tld}`)
          console.error(error(
            'The nameservers are pending propagation. Please try again shortly'
          ))
          info(
            `The ${tld} servers might take some extra time to reflect changes`
          )
          gracefulExit()
        }
      }

      console.log(
        `> Verifying the DNS settings for ${chalk.bold(
          chalk.underline(alias)
        )} (see ${chalk.underline('https://zeit.world')} for help)`
      )

      const _domain = publicSuffixList.parse(alias).domain
      let _domainInfo
      try {
        _domainInfo = await this.getDomain(_domain)
      } catch (err) {
        if (err.status === 404) {
          // It's ok if the domain was not found – we'll add it when creating
          // the alias
        } else {
          throw err
        }
      }
      const domainInfo =
        _domainInfo && !_domainInfo.error ? _domainInfo : undefined
      const { domain, nameservers } = domainInfo
        ? { domain: _domain }
        : await this.getNameservers(alias)
      const usingZeitWorld = domainInfo
        ? !domainInfo.isExternal
        : isZeitWorld(nameservers)
      let skipDNSVerification = false

      if (this._debug) {
        if (domainInfo) {
          console.log(
            `> [debug] Found domain ${domain} with verified:${domainInfo.verified}`
          )
        } else {
          console.log(
            `> [debug] Found domain ${domain} and nameservers ${nameservers}`
          )
        }
      }

      if (!usingZeitWorld && domainInfo) {
        if (domainInfo.verified) {
          skipDNSVerification = true
        } else if (domainInfo.uid) {
          const { verified, created } = await this.setupDomain(domain, {
            isExternal: true
          })
          if (!(created && verified)) {
            const e = new Error(
              `> Failed to verify the ownership of ${domain}, please refer to 'now domain --help'.`
            )
            e.userError = true
            throw e
          }
          console.log(
            `${chalk.cyan('> Success!')} Domain ${chalk.bold(
              chalk.underline(domain)
            )} verified`
          )
        }
      }

      try {
        if (!skipDNSVerification) {
          await this.verifyDomain(alias)
        }
      } catch (err) {
        if (err.userError) {
          // A user error would imply that verification failed
          // in which case we attempt to correct the dns
          // configuration (if we can!)
          try {
            if (usingZeitWorld) {
              console.log(
                `> Detected ${chalk.bold(
                  chalk.underline('zeit.world')
                )} nameservers! Configuring records.`
              )
              const record = alias.substr(0, alias.length - domain.length)

              // Lean up trailing and leading dots
              const _record = record.replace(/^\./, '').replace(/\.$/, '')
              const _domain = domain.replace(/^\./, '').replace(/\.$/, '')

              if (_record === '') {
                await this.setupRecord(_domain, '*')
              }

              await this.setupRecord(_domain, _record)

              this.recordSetup = true
              console.log('> DNS Configured! Verifying propagation…')

              try {
                await this.retry(() => this.verifyDomain(alias), {
                  retries: 10,
                  maxTimeout: 8000
                })
              } catch (err2) {
                const e = new Error(
                  '> We configured the DNS settings for your alias, but we were unable to ' +
                    "verify that they've propagated. Please try the alias again later."
                )
                e.userError = true
                throw e
              }
            } else {
              console.log(
                `> Resolved IP: ${err.ip
                  ? `${chalk.underline(err.ip)} (unknown)`
                  : chalk.dim('none')}`
              )
              console.log(
                `> Nameservers: ${nameservers && nameservers.length
                  ? nameservers.map(ns => chalk.underline(ns)).join(', ')
                  : chalk.dim('none')}`
              )
              throw err
            }
          } catch (e) {
            if (e.userError) {
              throw e
            }

            throw err
          }
        } else {
          throw err
        }
      }

      if (!usingZeitWorld && !skipDNSVerification) {
        if (this._debug) {
          console.log(
            `> [debug] Trying to register a non-ZeitWorld domain ${domain} for the current user`
          )
        }

        const { uid, verified, created } = await this.setupDomain(domain, {
          isExternal: true
        })
        if (!(created && verified)) {
          const e = new Error(
            `> Failed to verify the ownership of ${domain}, please refer to 'now domain --help'.`
          )
          e.userError = true
          throw e
        }
        console.log(
          `${chalk.cyan('> Success!')} Domain ${chalk.bold(
            chalk.underline(domain)
          )} ${chalk.dim(`(${uid})`)} added`
        )
      }

      console.log(`> Verification ${chalk.bold('OK')}!`)
    }
    return alias
  }

  verifyDomain(domain) {
    return this.retry(
      async bail => {
        const url = `http://${domain}`
        let res

        try {
          res = await fetch(url, { method: 'HEAD', redirect: 'manual' })
        } catch (err) {
          if (err.code === 'ENOTFOUND') {
            // This means that the domain resolves to nowhere
            // Therefore, it has no DNS records
            // So let's just mark it as an userError so we try to setup the
            // DNS records
            const err = new Error(DOMAIN_VERIFICATION_ERROR)
            err.userError = true
            return bail(err)
          } else {
            throw new Error(`Failed to fetch "${url}"`)
          }
        }

        if (res.headers.get('server') !== 'now') {
          const err = new Error(DOMAIN_VERIFICATION_ERROR)
          err.userError = true
          return bail(err)
        }
      },
      { retries: 5 }
    )
  }
}
