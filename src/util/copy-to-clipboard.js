// @flow

// Packages
const { write } = require('clipboardy')

// $FlowFixMe
const _isTTY = process.stdout.isTTY

async function copyToClipboard(str: string, shouldCopy: boolean | string = 'auto', isTTY: boolean = _isTTY) {
  if (shouldCopy === false) {
    return false
  }

  if (shouldCopy === 'auto') {
    if (isTTY) {
      await write(str)
      return true
    } else {
      return false
    }
  }

  if (shouldCopy === true) {
    await write(str)
    return true
  }

  throw new TypeError(
    'The `copyToClipbard` value in now config has an invalid type'
  )
}

module.exports = copyToClipboard
