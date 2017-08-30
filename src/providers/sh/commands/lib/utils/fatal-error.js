const error = require('./output/error')
const exit = require('./exit')

module.exports = (msg, code = 1) => {
  error(msg)
  exit(code)
}
