module.exports = (string, n = 0) => {
  n -= string.length
  return string + ' '.repeat(n > -1 ? n : 0)
}
