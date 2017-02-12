const stripe = require('stripe')('pk_live_alyEi3lN0kSwbdevK0nrGwTw')

const Now = require('../lib')

module.exports = class CreditCards extends Now {

  async ls() {
    const res = await this._fetch('/www/user/cards')
    const body = await res.json()

    return body
  }

  async setDefault(cardId) {
    await this._fetch('/www/user/cards/default', {
      method: 'PUT',
      body: {cardId}
    })
    return true
  }

  async rm(cardId) {
    await this._fetch(`/www/user/cards/${encodeURIComponent(cardId)}`, {method: 'DELEtE'})
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
        const stripeToken = (await stripe.tokens.create({card})).id
        const res = await this._fetch('/www/user/cards', {
          method: 'POST',
          body: {stripeToken}
        })

        const body = await res.json()

        if (body.card && body.card.id) {
          resolve({
            last4: body.card.last4
          })
        } else if (body.error && body.error.message) {
          reject({message: body.error.message})
        } else {
          reject('Unknown error')
        }
      } catch (err) {
        reject({
          message: err.message || 'Unknown error'
        })
      }
    })
  }
}
