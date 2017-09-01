const { cyan } = require('chalk')
const { tick } = require('./chars')

const ok = msg => `${cyan(tick)} ${msg}`

module.exports = ok
