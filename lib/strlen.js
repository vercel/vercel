function strlen(str) {
  return str.replace(/\x1b[^m]*m/g, '').length
}

module.exports = strlen
