const { yellow } = require('chalk')

const note = msg => `${yellow('> NOTE:')} ${msg}`

module.exports = note
