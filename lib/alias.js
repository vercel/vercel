// Packages
import publicSuffixList from 'psl'
import minimist from 'minimist'
import chalk from 'chalk'

// Ours
import copy from './copy'
import toHost from './to-host'
import resolve4 from './dns'
import isZeitWorld from './is-zeit-world'
import {DOMAIN_VERIFICATION_ERROR} from './errors'
import Now from './'

const argv = minimist(process.argv.slice(2), {
  boolean: ['no-clipboard'],
  alias: {'no-clipboard': 'C'}
})

const isTTY = process.stdout.isTTY
const clipboard = !argv['no-clipboard']
const domainRegex = /^((?=[a-z0-9-]{1,63}\.)(xn--)?[a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,63}$/

export default class Alias extends Now {

  async ls(deployment) {
    if (deployment) {
      const target = await this.findDeployment(deployment)

      if (!target) {
        const err = new Error(`Aliases not found by "${deployment}". Run ${chalk.dim('`now alias ls`')} to see your aliases.`)
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

      // match prefix
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

  async set(deployment, alias) {
    // make alias lowercase
    alias = alias.toLowerCase()

    // trim leading and trailing dots
    // for example: `google.com.` => `google.com`
    alias = alias
      .replace(/^\.+/, '')
      .replace(/\.+$/, '')

    const depl = await this.findDeployment(deployment)
    if (!depl) {
      const err = new Error(`Deployment not found by "${deployment}". Run ${chalk.dim('`now ls`')} to see your deployments.`)
      err.userError = true
      throw err
    }

    // evaluate the alias
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
      console.log(`> Verifying the DNS settings for ${chalk.bold(chalk.underline(alias))} (see ${chalk.underline('https://zeit.world')} for help)`)

      const _domain = publicSuffixList.parse(alias).domain
      const _domainInfo = await this.getDomain(_domain)
      const domainInfo = _domainInfo && !_domainInfo.error ? _domainInfo : undefined
      const {domain, nameservers} = domainInfo ? {domain: _domain} : await this.getNameservers(alias)
      const usingZeitWorld = domainInfo ? !domainInfo.isExternal : isZeitWorld(nameservers)
      let skipDNSVerification = false

      if (this._debug) {
        if (domainInfo) {
          console.log(`> [debug] Found domain ${domain} with verified:${domainInfo.verified}`)
        } else {
          console.log(`> [debug] Found domain ${domain} and nameservers ${nameservers}`)
        }
      }

      if (!usingZeitWorld && domainInfo) {
        if (domainInfo.verified) {
          skipDNSVerification = true
        } else if (domainInfo.uid) {
          const e = new Error(`> The domain ${domain} is already registered with now but additional verification is needed, please refer to 'now domain --help'.`)
          e.userError = true
          throw e
        }
      }

      try {
        if (!skipDNSVerification) {
          await this.verifyOwnership(alias)
        }
      } catch (err) {
        if (err.userError) {
          // a user error would imply that verification failed
          // in which case we attempt to correct the dns
          // configuration (if we can!)
          try {
            if (usingZeitWorld) {
              console.log(`> Detected ${chalk.bold(chalk.underline('zeit.world'))} nameservers! Configuring records.`)
              const record = alias.substr(0, alias.length - domain.length)

              // lean up trailing and leading dots
              const _record = record
                .replace(/^\./, '')
                .replace(/\.$/, '')
              const _domain = domain
                .replace(/^\./, '')
                .replace(/\.$/, '')

              if (_record === '') {
                await this.setupRecord(_domain, '*')
              }

              await this.setupRecord(_domain, _record)

              this.recordSetup = true
              console.log('> DNS Configured! Verifying propagation…')

              try {
                await this.retry(() => this.verifyOwnership(alias), {retries: 10, maxTimeout: 8000})
              } catch (err2) {
                const e = new Error('> We configured the DNS settings for your alias, but we were unable to ' +
                            'verify that they\'ve propagated. Please try the alias again later.')
                e.userError = true
                throw e
              }
            } else {
              console.log(`> Resolved IP: ${err.ip ? `${chalk.underline(err.ip)} (unknown)` : chalk.dim('none')}`)
              console.log(`> Nameservers: ${nameservers && nameservers.length ? nameservers.map(ns => chalk.underline(ns)).join(', ') : chalk.dim('none')}`)
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
          console.log(`> [debug] Trying to register a non-ZeitWorld domain ${domain} for the current user`)
        }

        const {uid, verified, verifyToken, created} = await this.setupDomain(domain, {isExternal: true})
        if (created && verified) {
          console.log(`${chalk.cyan('> Success!')} Domain ${chalk.bold(chalk.underline(domain))} ${chalk.dim(`(${uid})`)} added`)
        } else if (verifyToken) {
          const e = new Error(`> Verification required: Please add the following TXT record on the external DNS server: _now.${domain}: ${verifyToken}`)
          e.userError = true
          throw e
        }
      }

      console.log(`> Verification ${chalk.bold('OK')}!`)
    }

    // unfortunately there's a situation where the verification
    // ownership code path in the `catch` above makes the
    // agent unexpectedly close. this is a workaround until
    // we figure out what's going on with `node-spdy`
    this._agent.close()
    this._agent._initAgent()

    const newAlias = await this.createAlias(depl, alias)
    if (!newAlias) {
      throw new Error(`Unexpected error occurred while setting up alias: ${JSON.stringify(newAlias)}`)
    }
    const {created, uid} = newAlias
    if (created) {
      const pretty = `https://${alias}`
      const output = `${chalk.cyan('> Success!')} Alias created ${chalk.dim(`(${uid})`)}:\n${chalk.bold(chalk.underline(pretty))} now points to ${chalk.bold(`https://${depl.url}`)} ${chalk.dim(`(${depl.uid})`)}`
      if (isTTY && clipboard) {
        let append
        try {
          await copy(pretty)
          append = '[copied to clipboard]'
        } catch (err) {
          append = ''
        } finally {
          console.log(`${output} ${append}`)
        }
      } else {
        console.log(output)
      }
    } else {
      console.log(`${chalk.cyan('> Success!')} Alias already exists ${chalk.dim(`(${uid})`)}.`)
    }
  }

  createAlias(depl, alias) {
    return this.retry(async (bail, attempt) => {
      if (this._debug) {
        console.time(`> [debug] /now/deployments/${depl.uid}/aliases #${attempt}`)
      }

      const res = await this._fetch(`/now/deployments/${depl.uid}/aliases`, {
        method: 'POST',
        body: {alias}
      })

      const body = await res.json()
      if (this._debug) {
        console.timeEnd(`> [debug] /now/deployments/${depl.uid}/aliases #${attempt}`)
      }

      // 409 conflict is returned if it already exists
      if (res.status === 409) {
        return {uid: body.error.uid}
      }

      // no retry on authorization problems
      if (res.status === 403) {
        const code = body.error.code

        if (code === 'custom_domain_needs_upgrade') {
          const err = new Error(`Custom domains are only enabled for premium accounts. Please upgrade at ${chalk.underline('https://zeit.co/account')}.`)
          err.userError = true
          return bail(err)
        }

        if (code === 'alias_in_use') {
          const err = new Error(`The alias you are trying to configure (${chalk.underline(chalk.bold(alias))}) is already in use by a different account.`)
          err.userError = true
          return bail(err)
        }

        if (code === 'forbidden') {
          const err = new Error('The domain you are trying to use as an alias is already in use by a different account.')
          err.userError = true
          return bail(err)
        }

        return bail(new Error('Authorization error'))
      }

      // all other errors
      if (body.error) {
        const code = body.error.code

        if (code === 'deployment_not_found') {
          return bail(new Error('Deployment not found'))
        }

        if (code === 'cert_missing') {
          console.log(`> Provisioning certificate for ${chalk.underline(chalk.bold(alias))}`)

          try {
            await this.createCert(alias)
          } catch (err) {
            // we bail to avoid retrying the whole process
            // of aliasing which would involve too many
            // retries on certificate provisioning
            return bail(err)
          }

          // try again, but now having provisioned the certificate
          return this.createAlias(depl, alias)
        }

        if (code === 'cert_expired') {
          console.log(`> Renewing certificate for ${chalk.underline(chalk.bold(alias))}`)

          try {
            await this.createCert(alias, {renew: true})
          } catch (err) {
            return bail(err)
          }
        }

        return bail(new Error(body.error.message))
      }

      // the two expected succesful cods are 200 and 304
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
        body: {
          type,
          name: name === '' ? name : '*',
          value: 'alias.zeit.co'
        }
      })

      if (this._debug) {
        console.timeEnd(`> [debug] /domains/${domain}/records #${attempt}`)
      }

      if (res.status === 403) {
        return bail(new Error('Unauthorized'))
      }

      const body = await res.json()

      if (res.status !== 200) {
        throw new Error(body.error.message)
      }

      return body
    })
  }

  verifyOwnership(domain) {
    return this.retry(async bail => {
      const targets = await resolve4('alias.zeit.co')

      if (targets.length <= 0) {
        return bail(new Error('Unable to resolve alias.zeit.co'))
      }

      let ips = []

      try {
        ips = await resolve4(domain)
      } catch (err) {
        if (err.code === 'ENODATA' || err.code === 'ESERVFAIL' || err.code === 'ENOTFOUND') {
          // not errors per se, just absence of records
          if (this._debug) {
            console.log(`> [debug] No records found for "${domain}"`)
          }

          const err = new Error(DOMAIN_VERIFICATION_ERROR)
          err.userError = true
          return bail(err)
        }
        throw err
      }

      if (ips.length <= 0) {
        const err = new Error(DOMAIN_VERIFICATION_ERROR)
        err.userError = true
        return bail(err)
      }

      for (const ip of ips) {
        if (targets.indexOf(ip) === -1) {
          const err = new Error(`The domain ${domain} has an A record ${chalk.bold(ip)} that doesn't resolve to ${chalk.bold(chalk.underline('alias.zeit.co'))}.\n> ` + DOMAIN_VERIFICATION_ERROR)
          err.ip = ip
          err.userError = true
          return bail(err)
        }
      }
    })
  }
}
