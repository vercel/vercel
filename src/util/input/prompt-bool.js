// theirs
const chalk = require('chalk')

// ours
const eraseLines = require('../output/erase-lines')

module.exports = (
  label,
  {
    defaultValue = false,
    abortSequences = new Set(['\u0003', '\u001b']), // ctrl+c, esc
    resolveChars = new Set(['\r']), // enter
    yesChar = 'y',
    noChar = 'n',
    stdin = process.stdin,
    stdout = process.stdout,
    // if `true`, `eraseLines(1)` will be `stdout.write`d before
    // `resolve`ing or `reject`ing
    clearWhenDone = true
  } = {}
) => {
  return new Promise((resolve, reject) => {
    const isRaw = stdin.isRaw

    stdin.setRawMode(true)
    stdin.resume()

    function restore() {
      if (clearWhenDone) {
        stdout.write(eraseLines(1))
      }
      stdin.setRawMode(isRaw)
      stdin.pause()
      stdin.removeListener('data', onData)
    }

    function onData(buffer) {
      const data = buffer.toString()

      if (data[0].toLowerCase() === yesChar) {
        restore()
        resolve(true)
      } else if (data[0].toLowerCase() === noChar) {
        restore()
        resolve(false)
      } else if (abortSequences.has(data)) {
        restore()
        const e = new Error('User abort')
        e.code = 'USER_ABORT'
        reject(e)
      } else if (resolveChars.has(data[0])) {
        restore()
        resolve(defaultValue)
      } else {
        // ignore extraneous input
      }
    }

    const defaultText =
      defaultValue === null
        ? `[${yesChar}|${noChar}]`
        : defaultValue
          ? `[${chalk.bold(yesChar.toUpperCase())}|${noChar}]`
          : `[${yesChar}|${chalk.bold(noChar.toUpperCase())}]`
    stdout.write(`${label} ${chalk.gray(defaultText)} `)
    stdin.on('data', onData)
  })
}
