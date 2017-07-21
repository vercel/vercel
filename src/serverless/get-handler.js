// @flow
const { readFileSync } = require('fs')
const { join } = require('path')
const handler = readFileSync(join(__dirname, 'handler.js')).toString()

// symbols to replace in the meta-source
const CMD_SYMBOL = '/*NOW_CMD*/'
const SCRIPT_SYMBOL = '/*NOW_SCRIPT*/'
const REQ_HANDLER_SYMBOL = '/*PROXY_REQUEST_SOURCE*/'

if (handler.indexOf(CMD_SYMBOL) < 0) {
  throw new Error('Missing symbol in `handler.js`: ' + CMD_SYMBOL)
}

if (handler.indexOf(SCRIPT_SYMBOL) < 0) {
  throw new Error('Missing symbol in `handler.js`: ' + SCRIPT_SYMBOL)
}

if (handler.indexOf(REQ_HANDLER_SYMBOL) < 0) {
  throw new Error('Missing symbol in `handler.js`: ' + REQ_HANDLER_SYMBOL)
}

const getHandler = (
  { cmd, script }: { cmd: ?string, script: ?string },
  fn: Function
) =>
  handler
    .replace(CMD_SYMBOL, JSON.stringify(cmd))
    .replace(SCRIPT_SYMBOL, JSON.stringify(script))
    .replace(REQ_HANDLER_SYMBOL, fn.toString())

module.exports = getHandler
