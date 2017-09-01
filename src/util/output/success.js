const { cyan } = require('chalk')

const success = msg => `${cyan('> Success!')} ${msg}`

module.exports = success
