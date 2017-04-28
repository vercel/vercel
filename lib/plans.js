const ms = require('ms');

const Now = require('../lib');

async function parsePlan(res) {
  let id;
  let until;
  const { subscription } = await res.json()

  if (subscription) {
    const planItems = subscription.items.data;
    const mainPlan = planItems.find(d => d.plan.metadata.is_main_plan === '1');

    if (mainPlan) {
      id = mainPlan.plan.id
      if (subscription.cancel_at_period_end) {
        until = ms(
          new Date(subscription.current_period_end * 1000) - new Date(),
          { long: true }
        );
      }
    } else {
      id = 'oss'
    }
  } else {
    id = 'oss';
  }
  
  return { id, until };
}

module.exports = class Plans extends Now {
  async getCurrent() {
    const res = await this._fetch('/plan');
    return parsePlan(res);
  }

  async set(plan) {
    const res = await this._fetch('/plan', {
      method: 'PUT',
      body: { plan }
    });

    if (res.ok) {
      return parsePlan(res);
    }

    const err = new Error(res.statusText);
    err.res = res;
    throw err;
  }
};
