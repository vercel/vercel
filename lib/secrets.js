// Ours
const Now = require('../lib')

module.exports = class Secrets extends Now {
  ls() {
    return this.listSecrets()
  }

  rm(nameOrId) {
    return this.retry(async (bail, attempt) => {
      if (this._debug) {
        console.time(`> [debug] #${attempt} DELETE /secrets/${nameOrId}`)
      }

      const res = await this._fetch(`/now/secrets/${nameOrId}`, {
        method: 'DELETE'
      })

      if (this._debug) {
        console.timeEnd(`> [debug] #${attempt} DELETE /secrets/${nameOrId}`)
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

  add(name, value) {
    return this.retry(async (bail, attempt) => {
      if (this._debug) {
        console.time(`> [debug] #${attempt} POST /secrets`)
      }

      const res = await this._fetch('/now/secrets', {
        method: 'POST',
        body: {
          name,
          value: value.toString()
        }
      })

      if (this._debug) {
        console.timeEnd(`> [debug] #${attempt} POST /secrets`)
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

  rename(nameOrId, newName) {
    return this.retry(async (bail, attempt) => {
      if (this._debug) {
        console.time(`> [debug] #${attempt} PATCH /secrets/${nameOrId}`)
      }

      const res = await this._fetch(`/now/secrets/${nameOrId}`, {
        method: 'PATCH',
        body: {
          name: newName
        }
      })

      if (this._debug) {
        console.timeEnd(`> [debug] #${attempt} PATCH /secrets/${nameOrId}`)
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
