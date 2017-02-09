const ansiEscapes = require('ansi-escapes')
const ansiRegex = require('ansi-regex')
// const chalk = require('chalk')
//
const ESCAPES = {
  LEFT: '\x1b[D',
  RIGHT: '\x1b[C',
}

module.exports = function ({
  label = '',
  initialValue = '',
  abortSequences = new Set(['\x03']),
  eraseSequences = new Set(['\x08', '\x7f']),
  stdin = process.stdin,
  stdout = process.stdout
} = {}) {
  return new Promise((resolve, reject) => {
    const isRaw = process.stdin.isRaw

    stdout.write(label + initialValue)
    stdin.setRawMode(true)
    stdin.resume()

    function restore() {
      stdin.setRawMode(isRaw)
      stdin.pause()
      stdin.removeListener('data', onData)
    }

    let value = initialValue
    let caretOffset = 0

    function onData(buffer) {
      const data = buffer.toString()

      if (abortSequences.has(data)) {
        restore()
        return reject(new Error('USER_ABORT'))
      }

      if (data === '\x1b[D') {
        if (value.length > Math.abs(caretOffset)) {
          caretOffset--
        }
      } else if (data === '\x1b[C') {
        if (caretOffset < 0) {
          caretOffset++
        }
      } else if (data === '\x08' || data === '\x7f') {
        // delete key needs splicing according to caret position
        value = value.substr(0, value.length + caretOffset - 1) +
          value.substr(value.length + caretOffset)
      } else if (!ansiRegex().test(data)) {
        value = value.substr(0, value.length + caretOffset) + data +
            value.substr(value.length + caretOffset)
      }

      stdout.write(ansiEscapes.eraseLines(1) + label + value)
      if (caretOffset) {
        process.stdout.write(ansiEscapes.cursorBackward(Math.abs(caretOffset)))
      }
    }

    stdin.on('data', onData)
  })
}
