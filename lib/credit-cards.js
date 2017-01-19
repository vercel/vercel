// Ours
const Now = require('../lib')

module.exports = class CreditCards extends Now {

  async ls() {
    const res = await this._fetch('/www/user/cards')
    const body = await res.json()

    body.defaultCardId = body.defaultCardId.replace('card_', '')
    body.cards.map(card => {
      card.id = card.id.replace('card_', '')
      return card
    })
    return body
  }
}
