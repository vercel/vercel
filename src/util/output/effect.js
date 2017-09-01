const { gray } = require('chalk')

const effect = msg => `${gray(`+ ${msg}`)}`

module.exports = effect
