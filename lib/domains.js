// Packages
import chalk from 'chalk'

// Ours
import Now from '../lib'
import isZeitWorld from './is-zeit-world'
import {DNS_VERIFICATION_ERROR} from './errors'

const domainRegex = /^((?=[a-z0-9-]{1,63}\.)(xn--)?[a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,63}$/

export default class Domains extends Now {

  async ls() {
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

  async rm(name) {
    return this.retry(async (bail, attempt) => {
      if (this._debug) {
        console.time(`> [debug] #${attempt} DELETE /domains/${name}`)
      }

      const res = await this._fetch(`/domains/${name}`, {method: 'DELETE'})

      if (this._debug) {
        console.timeEnd(`> [debug] #${attempt} DELETE /domains/${name}`)
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

  async add(domain) {
    if (!domainRegex.test(domain)) {
      const err = new Error(`The supplied value ${chalk.bold(`"${domain}"`)} is not a valid domain.`)
      err.userError = true
      throw err
    }

    let ns

    try {
      console.log('> Verifying nameservers…')
      const res = await this.getNameservers(domain)
      ns = res.nameservers
    } catch (err) {
      const err2 = new Error(`Unable to fetch nameservers for ${chalk.underline(chalk.bold(domain))}.`)
      err2.userError = true
      throw err2
    }

    if (isZeitWorld(ns)) {
      console.log(`> Verification ${chalk.bold('OK')}!`)
      return this.setupDomain(domain)
    }

    if (this._debug) {
      console.log(`> [debug] Supplied domain "${domain}" has non-zeit nameservers`)
    }

    const err3 = new Error(DNS_VERIFICATION_ERROR)
    err3.userError = true
    throw err3
  }

}
