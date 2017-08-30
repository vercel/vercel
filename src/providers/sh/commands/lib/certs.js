// Ours
const Now = require('../lib')

module.exports = class Certs extends Now {
  ls() {
    return this.retry(async (bail, attempt) => {
      if (this._debug) {
        console.time(`> [debug] #${attempt} GET now/certs`)
      }

      const res = await this._fetch('/now/certs')

      if (this._debug) {
        console.timeEnd(`> [debug] #${attempt} GET now/certs`)
      }

      const body = await res.json()
      return body.certs
    })
  }

  create(cn) {
    return this.createCert(cn)
  }

  renew(cn) {
    return this.createCert(cn, { renew: true })
  }

  put(cn, crt, key, ca) {
    return this.retry(async (bail, attempt) => {
      if (this._debug) {
        console.time(`> [debug] #${attempt} PUT now/certs`)
      }

      const res = await this._fetch('/now/certs', {
        method: 'PUT',
        body: {
          domains: [cn],
          ca,
          cert: crt,
          key
        }
      })

      if (this._debug) {
        console.timeEnd(`> [debug] #${attempt} PUT now/certs`)
      }

      if (res.status === 403) {
        return bail(new Error('Unauthorized'))
      }

      const body = await res.json()

      if (res.status !== 200) {
        if (res.status === 404 || res.status === 400) {
          const err = new Error(body.error.message)
          err.userError = true
          return bail(err)
        }

        throw new Error(body.error.message)
      }

      return body
    })
  }

  delete(cn) {
    return this.retry(async (bail, attempt) => {
      if (this._debug) {
        console.time(`> [debug] #${attempt} DELETE now/certs/${cn}`)
      }

      const res = await this._fetch(`/now/certs/${cn}`, { method: 'DELETE' })

      if (this._debug) {
        console.timeEnd(`> [debug] #${attempt} DELETE now/certs/${cn}`)
      }

      if (res.status === 403) {
        return bail(new Error('Unauthorized'))
      }

      const body = await res.json()

      if (res.status !== 200) {
        if (res.status === 404 || res.status === 400) {
          const err = new Error(body.error.message)
          err.userError = true
          return bail(err)
        }

        throw new Error(body.error.message)
      }

      return body
    })
  }
}
