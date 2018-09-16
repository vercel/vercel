function strlen(str) {
  return str.replace(new RegExp("u001b[^m]*m/g"), '').length
}

module.exports = strlen
