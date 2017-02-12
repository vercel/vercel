// Ours
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
    cardId = this.insertIdPrefix(cardId)
    await this._fetch(`/www/user/cards/${encodeURIComponent(cardId)}`, {method: 'DELEtE'})
    return true
  }
}
