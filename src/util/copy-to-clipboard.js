// @flow

// Packages
const { write } = require('clipboardy')

const copyToClipboard = async (
  str: string,
  shouldCopy: boolean | string = 'auto',
  // $FlowFixMe
  isTTY: boolean = process.stdout.isTTY
): Promise<boolean> => {
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
