const ansiEscapes = require('ansi-escapes')

const eraseLines = n => ansiEscapes.eraseLines(n)

module.exports = eraseLines
