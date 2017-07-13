const { bold } = require('chalk')

const highlight = text => bold.underline(text)

module.exports = highlight
