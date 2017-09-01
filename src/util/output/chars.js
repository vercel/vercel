const chars = {
  // in some setups now.exe crashes if we use
  // the normal tick unicode character :|
  tick: process.platform === 'win32' ? '√' : '✔'
}

module.exports = chars
