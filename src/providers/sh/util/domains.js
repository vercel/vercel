// Native
const { encode: encodeQuery } = require('querystring')

// Packages
const chalk = require('chalk')

// Ours
const Now = require('.')
const isZeitWorld = require('./is-zeit-world')
const { DNS_VERIFICATION_ERROR } = require('./errors')
const cmd = require('../../../util/output/param')

const domainRegex = /^((?=[a-z0-9-]{1,63}\.)(xn--)?[a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,63}$/

module.exports = class Domains extends Now {
  async ls() {
    return this.listDomains()
  }

  async rm(domain) {
    // Remove aliases
    for (const aliasId of domain.aliases) {
      this.retry(async (bail, attempt) => {
        const label = `> [debug] #${attempt} DELETE now/aliases/${aliasId}`
        if (this._debug) {
          console.time(label)
        }

        const res = await this._fetch(`/now/aliases/${aliasId}`, {
          method: 'DELETE'
        })

        if (this._debug) {
          console.timeEnd(label)
        }

        if (res.status === 403) {
          return bail(new Error('Unauthorized'))
        }

        if (res.status !== 200) {
          const body = await res.json()
          throw new Error(body.error.message)
        }
      })
    }

    // Remove certs
    for (const cn of domain.certs) {
      this.retry(async (bail, attempt) => {
        const label = `> [debug] #${attempt} DELETE now/certs/${cn}`
        if (this._debug) {
          console.time(label)
        }

        const res = await this._fetch(`/now/certs/${cn}`, { method: 'DELETE' })

        if (this._debug) {
          console.timeEnd(label)
        }

        if (res.status === 403) {
          return bail(new Error('Unauthorized'))
        }

        if (res.status !== 200) {
          const body = await res.json()
          throw new Error(body.error.message)
        }
      })
    }

    // Remove the domain
    const name = domain.name
    return this.retry(async (bail, attempt) => {
      const label = `> [debug] #${attempt} DELETE /domains/${name}`
      if (this._debug) {
        console.time(label)
      }

      const res = await this._fetch(`/domains/${name}`, { method: 'DELETE' })

      if (this._debug) {
        console.timeEnd(label)
      }

      if (res.status === 403) {
        return bail(new Error('Unauthorized'))
      }

      if (res.status === 409) {
        const body = await res.json()
        return bail(new Error(body.error.message))
      }

      if (res.status !== 200) {
        const body = await res.json()
        throw new Error(body.error.message)
      }
    })
  }

  async add(domain, skipVerification, isExternal) {
    if (!domainRegex.test(domain)) {
      const err = new Error(
        `The supplied value ${chalk.bold(`"${domain}"`)} is not a valid domain.`
      )
      err.userError = true
      throw err
    }

    if (skipVerification || isExternal) {
      return this.setupDomain(domain, { isExternal })
    }

    let ns

    try {
      console.log('> Verifying nameservers…')
      const res = await this.getNameservers(domain)
      ns = res.nameservers
    } catch (err) {
      const err2 = new Error(
        `Unable to fetch nameservers for ${chalk.underline(
          chalk.bold(domain)
        )}.`
      )
      err2.userError = true
      throw err2
    }

    if (isZeitWorld(ns)) {
      console.log(`> Verification ${chalk.bold('OK')}!`)
      return this.setupDomain(domain)
    }

    if (this._debug) {
      console.log(
        `> [debug] Supplied domain "${domain}" has non-zeit nameservers`
      )
    }

    const err3 = new Error(DNS_VERIFICATION_ERROR)
    err3.userError = true
    throw err3
  }

  async status(name) {
    if (!name) {
      throw new Error('`domain` is not defined')
    }

    const query = encodeQuery({ name })

    return this.retry(async (bail, attempt) => {
      if (this._debug) {
        console.time(`> [debug] #${attempt} GET /domains/status?${query}`)
      }

      const res = await this._fetch(`/domains/status?${query}`)
      const json = await res.json()

      if (this._debug) {
        console.timeEnd(`> [debug] #${attempt} GET /domains/status?${query}`)
      }

      return json.available
    })
  }

  async price(name) {
    if (!name) {
      throw new Error('`domain` is not defined')
    }

    const query = encodeQuery({ name })

    return this.retry(async (bail, attempt) => {
      if (this._debug) {
        console.time(`> [debug] #${attempt} GET /domains/price?${query}`)
      }

      const res = await this._fetch(`/domains/price?${query}`)
      const json = await res.json()

      if (res.status === 400) {
        const e = new Error(json.error.message)
        e.code = json.error.code
        return bail(e)
      }

      if (this._debug) {
        console.timeEnd(`> [debug] #${attempt} GET /domains/price?${query}`)
      }

      return json
    })
  }

  async buy({ name, coupon }) {
    if (!name) {
      throw new Error('`name` is not defined')
    }

    const body = JSON.stringify({ name, coupon })

    return this.retry(async (bail, attempt) => {
      if (this._debug) {
        console.time(`> [debug] #${attempt} GET /domains/buy`)
      }
      const res = await this._fetch(`/domains/buy`, {
        method: 'POST',
        body
      })
      const json = await res.json()

      if (this._debug) {
        console.timeEnd(`> [debug] #${attempt} GET /domains/buy`)
      }

      if ([400, 403, 500, 503].includes(res.status)) {
        const e = new Error()
        e.code = json.error.code
        if (json.error.code === 'source_not_found') {
          e.message = `No credit cards found – please run ${cmd('now cc add')}`
        } else {
          e.message = json.error.message
        }
        return bail(e)
      }

      return json
    })
  }

  async coupon(coupon) {
    if (!coupon) {
      throw new Error('`coupon` is not defined')
    }

    const query = encodeQuery({ coupon })

    return this.retry(async (bail, attempt) => {
      if (this._debug) {
        console.time(`> [debug] #${attempt} GET /domains/buy?${query}`)
      }

      const res = await this._fetch(`/domains/buy?${query}`)
      const json = await res.json()

      if (res.status !== 200) {
        const e = new Error(json.error.message)
        e.code = json.error.code
        return bail(e)
      }

      if (this._debug) {
        console.timeEnd(`> [debug] #${attempt} GET /domains/buy?${query}`)
      }

      return json
    })
  }
}
