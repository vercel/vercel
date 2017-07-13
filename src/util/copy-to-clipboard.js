const { write } = require('clipboardy')

const copyToClipboard = async (
  str: string,
  shouldCopy = 'auto',
  isTTY = process.stdout.isTTY
): boolean => {
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
