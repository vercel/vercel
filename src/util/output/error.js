const { red } = require('chalk')

// error('woot') === '> woot'
// error('woot', 'yay') === 'woot\nyay'
const error = (...msgs) => `${red('> Error!')} ${msgs.join('\n')}`

module.exports = error
