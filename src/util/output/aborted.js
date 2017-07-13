const { red } = require('chalk')

const error = msg => `${red('> Aborted!')} ${msg}`

module.exports = error
