// Ours
const Now = require('../lib')

module.exports = class Scale extends Now {
  getInstances(id) {
    return this.retry(async (bail, attempt) => {
      if (this._debug) {
        console.time(`> [debug] #${attempt} GET /deployments/${id}/instances`)
      }

      const res = await this._fetch(`/now/deployments/${id}/instances`, {
        method: 'GET'
      })

      if (this._debug) {
        console.timeEnd(`> [debug] #${attempt} GET /deployments/${id}/instances`)
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
