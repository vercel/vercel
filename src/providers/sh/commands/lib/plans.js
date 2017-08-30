const ms = require('ms')

const Now = require('../lib')

async function parsePlan(json) {
  const { subscription } = json
  let id
  let until
  let name

  if (subscription) {
    const planItems = subscription.items.data
    const mainPlan = planItems.find(d => d.plan.metadata.is_main_plan === '1')

    if (mainPlan) {
      id = mainPlan.plan.id
      name = mainPlan.plan.name
      if (subscription.cancel_at_period_end) {
        until = ms(
          new Date(subscription.current_period_end * 1000) - new Date(),
          { long: true }
        )
      }
    } else {
      id = 'oss'
    }
  } else {
    id = 'oss'
  }

  return { id, name, until }
}

module.exports = class Plans extends Now {
  async getCurrent() {
    const res = await this._fetch('/plan')
    const json = await res.json()
    return parsePlan(json)
  }

  async set(plan) {
    const res = await this._fetch('/plan', {
      method: 'PUT',
      body: { plan }
    })

    const json = await res.json()

    if (res.ok) {
      return parsePlan(json)
    }

    const err = new Error(json.error.message)
    err.code = json.error.code
    throw err
  }
}
