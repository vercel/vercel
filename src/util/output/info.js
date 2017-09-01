const { gray } = require('chalk')

// info('woot') === '> woot'
// info('woot', 'yay') === 'woot\nyay'
const info = (...msgs) => `${gray('>')} ${msgs.join('\n')}`

module.exports = info
