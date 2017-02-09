const ansiEscapes = require('ansi-escapes')
const ansiRegex = require('ansi-regex')

const ESCAPES = {
  LEFT: '\x1b[D',
  RIGHT: '\x1b[C',
  CTRL_C: '\x03',
  BACKSPACE: '\x08',
  CTRL_H: '\x7f',
  CARRIAGE: '\r'
}

module.exports = function ({
  label = '',
  initialValue = '',
  abortSequences = new Set(['\x03']),
  eraseSequences = new Set([ESCAPES.BACKSPACE, ESCAPES.CTRL_H]),
  resolveChars = new Set([ESCAPES.CARRIAGE]),
  stdin = process.stdin,
  stdout = process.stdout,
  // char to print before resolving/rejecting the promise
  // if `false`, nothing will be printed
  trailing = ansiEscapes.eraseLines(1),
  // receives the current keystroke as a parameter
  validate = () => true
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
      if (trailing) {
        stdout.write(trailing)
      }
    }

    let value = initialValue
    let caretOffset = 0

    function onData(buffer) {
      const data = buffer.toString()

      if (abortSequences.has(data)) {
        restore()
        return reject(new Error('USER_ABORT'))
      }

      if (data === ESCAPES.LEFT) {
        if (value.length > Math.abs(caretOffset)) {
          caretOffset--
        }
      } else if (data === ESCAPES.RIGHT) {
        if (caretOffset < 0) {
          caretOffset++
        }
      } else if (eraseSequences.has(data)) {
        // delete key needs splicing according to caret position
        value = value.substr(0, value.length + caretOffset - 1) +
          value.substr(value.length + caretOffset)
      } else if (resolveChars.has(data)) {
        restore()
        return resolve(value)
      } else if (!validate(data)) {
        return
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
