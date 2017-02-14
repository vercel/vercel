const ms = require('ms')

const Now = require('../lib')

async function parsePlan(res) {
  let id
  let until

  const {subscription} = await res.json()

  if (subscription) {
    id = subscription.plan.id

    if (subscription.cancel_at_period_end) {
      until = ms(
        new Date(subscription.current_period_end * 1000) - new Date(),
        {long: true}
      )
    }
  } else {
    id = 'oss'
  }

  return {id, until}
}

module.exports = class Plans extends Now {

  async getCurrent() {
    const res = await this._fetch('/www/user/plan')

    return await parsePlan(res)
  }

  async set(plan) {
    const res = await this._fetch('/www/user/plan', {
      method: 'PUT',
      body: {plan}
    })

    if (res.ok) {
      return await parsePlan(res)
    }
    const err = new Error(res.statusText)
    err.res = res
    throw err
  }
}
