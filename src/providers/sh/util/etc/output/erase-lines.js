const ansiEscapes = require('ansi-escapes')

module.exports = n => process.stdout.write(ansiEscapes.eraseLines(n))
