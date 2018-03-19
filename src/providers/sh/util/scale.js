// Ours
const Now = require('.')

module.exports = class Scale extends Now {
  getInstances(id) {
    const url = `/v3/now/deployments/${id}/instances`;

    return this.retry(async (bail, attempt) => {
      if (this._debug) {
        console.time(`> [debug] #${attempt} GET ${url}`)
      }

      const res = await this._fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      })

      if (this._debug) {
        console.timeEnd(
          `> [debug] #${attempt} GET ${url}`
        )
      }

      const body = await res.json()

      if (res.status !== 200) {
        if ([400, 403, 404].includes(res.status)) {
          const err = new Error(body.error.message)
          err.userError = true
          return bail(err)
        }

        throw new Error(body.error.message)
      }

      return body
    })
  }

  setScale(id, scale) {
    const { time } = this._output
    const url = `/v3/now/deployments/${id}/instances`;

    return this.retry(
      async (bail, attempt) => {
        const res = await time(
          `#${attempt} PATCH ${url}`,
          this._fetch(url, {
            method: 'PATCH',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            },
            body: scale
          })
        )

        if (res.status === 403) {
          return bail(new Error('Unauthorized'))
        }

        const body = await res.json()

        if (!res.ok) {
          if (body) {
            if ((res.status === 404 || res.status === 400) &&
              body.error && body.error.code) {
              const err = new Error(body.error.message)
              err.userError = body.error.code === 'not_snapshotted';
              return bail(err)
            }

            if (body.error && body.error.message) {
              const err = new Error(body.error.message)
              return bail(err)
            }
          }

          throw new Error(
            `Error occurred while scaling. Please try again later`
          )
        }
      },
      {
        retries: 5,
        maxTimeout: 5000,
        factor: 1.1
      }
    )
  }
}
