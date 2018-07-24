const stripe = require('stripe')('pk_live_alyEi3lN0kSwbdevK0nrGwTw')

const Now = require('.')

module.exports = class CreditCards extends Now {
  async ls() {
    const res = await this._fetch('/stripe/sources/')
    const body = await res.json()

    if (res.status !== 200) {
      const e = new Error(body.error.message)
      e.code = body.error.code
      throw e
    }

    return body
  }

  async setDefault(source) {
    await this._fetch('/stripe/sources/', {
      method: 'POST',
      body: {
        source,
        makeDefault: true
      }
    })

    return true
  }

  async rm(source) {
    await this._fetch(`/stripe/sources/`, {
      method: 'DELETE',
      body: { source }
    })

    return true
  }

  /* eslint-disable camelcase */
  add(card) {
    return new Promise(async (resolve, reject) => {
      const expDateParts = card.expDate.split(' / ')
      card = {
        name: card.name,
        number: card.cardNumber,
        cvc: card.ccv,
        address_country: card.country,
        address_zip: card.zipCode,
        address_state: card.state,
        address_city: card.city,
        address_line1: card.address1
      }

      card.exp_month = expDateParts[0]
      card.exp_year = expDateParts[1]

      try {
        const token = (await stripe.tokens.create({ card })).id

        const res = await this._fetch('/stripe/sources/', {
          method: 'POST',
          body: {
            source: token
          }
        })

        const { source, error } = await res.json()

        if (source && source.id) {
          resolve({
            last4: source.last4
          })
        } else if (error && error.message) {
          reject(new Error(error.message))
        } else {
          reject(new Error('Unknown error'))
        }
      } catch (err) {
        reject(new Error(err.message || 'Unknown error'))
      }
    })
  }
}
