// inspired by https://github.com/zeit/email-prompt

// theirs
const ansiEscapes = require('ansi-escapes')
const stripAnsi = require('strip-ansi')

// ours
const eraseLines = require('../output/erase-lines')

const ESCAPES = {
  LEFT: '\u001B[D',
  RIGHT: '\u001B[C',
  CTRL_C: '\x03',
  BACKSPACE: '\u0008',
  CTRL_H: '\u007F',
  CARRIAGE: '\r'
}

const textInput = ({
  label = 'Enter some text: ',
  resolveChars = new Set([ESCAPES.CARRIAGE]),
  abortChars = new Set([ESCAPES.CTRL_C]),
  // if `true`, `eraseLines(1)` will be `stdout.write`d before
  // `resolve`ing or `reject`ing
  clearWhenDone = true
}) => {
  return new Promise((resolve, reject) => {
    if (!process.stdin.setRawMode) {
      // Some environments (e.g., cygwin) don't provide a tty
      const e = new Error('stdin lacks setRawMode support')
      e.userError = true
      restore()
      reject(e)
    }

    const isRaw = process.stdin.isRaw

    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdout.write(label)

    let input = '' // Whatever the user types
    let caretOffset = 0 // Left/right keys

    const onData = buffer => {
      let data = buffer.toString()

      if (abortChars.has(data)) {
        const e = new Error('User abort')
        e.code = 'USER_ABORT'
        restore()
        return reject(e)
      }

      if (data === ESCAPES.LEFT) {
        if (input.length > Math.abs(caretOffset)) {
          caretOffset--
        }
      } else if (data === ESCAPES.RIGHT) {
        if (caretOffset < 0) {
          caretOffset++
        }
      } else if (data === '\x08' || data === '\x7f') {
        // Delete key needs splicing according to caret position
        input =
          input.substr(0, input.length + caretOffset - 1) +
          input.substr(input.length + caretOffset)
      } else {
        if (resolveChars.has(data)) {
          restore()
          resolve(input)
        }

        if (stripAnsi(data).length !== data.length) {
          data = ''
        }

        input =
          input.substr(0, input.length + caretOffset) +
          stripAnsi(data) +
          input.substr(input.length + caretOffset)
      }

      process.stdout.write(eraseLines(1) + label + input)
      if (caretOffset) {
        process.stdout.write(ansiEscapes.cursorBackward(Math.abs(caretOffset)))
      }
    }

    const restore = () => {
      if (clearWhenDone) {
        process.stdout.write(eraseLines(1))
      }
      process.stdin.setRawMode(isRaw)
      process.stdin.pause()
      process.stdin.removeListener('data', onData)
    }

    process.stdin.on('data', onData)
  })
}

module.exports = textInput
