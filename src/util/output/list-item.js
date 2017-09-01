const { gray } = require('chalk')

// listItem('woot') === '- woot'
// listItem('->', 'woot') === '-> woot'
// listItem(1, 'woot') === '1. woot'
const listItem = (n, msg) => {
  if (!msg) {
    msg = n
    n = '-'
  }
  if (!isNaN(n)) {
    n += '.'
  }
  return `${gray(n)} ${msg}`
}

module.exports = listItem
