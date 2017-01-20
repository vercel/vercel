// Ours
const Now = require('../lib')

module.exports = class CreditCards extends Now {

  // Removes the `card_` prefix from the card id – Stripe uses that
  // but we don't want to show it to the user
  // `arg` can be a string or a Object with a `id` field
  stripIdPrefix(arg) {
    if (typeof arg === 'string') {
      return arg.replace('card_', '')
    }
    if (typeof arg === 'object') {
      arg.id = arg.id.replace('card_', '')
      return arg
    }
    return ''
  }

  // Inserts the `card_` prefix back
  // `arg` can be a string or a Object with a `id` field
  insertIdPrefix(arg) {
    if (typeof arg === 'string') {
      return `card_${arg}`
    }
    if (typeof arg === 'object') {
      arg.id = `card_${arg.id}`
      return arg
    }
    return ''
  }

  async ls() {
    const res = await this._fetch('/www/user/cards')
    const body = await res.json()

    body.defaultCardId = this.stripIdPrefix(body.defaultCardId)
    body.cards.map(card => this.stripIdPrefix(card))
    return body
  }

  async setDefault(cardId) {
    cardId = this.insertIdPrefix(cardId)
    await this._fetch('/www/user/cards/default', {
      method: 'PUT',
      body: {cardId}
    })
    return true
  }

  async rm(cardId) {
    cardId = this.insertIdPrefix(cardId)
    await this._fetch(`/www/user/cards/${encodeURIComponent(cardId)}`, {method: 'DELEtE'})
    return true
  }
}
