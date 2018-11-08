function strlen(str) {
  return str.replace(/\u001b[^m]*m/g, '').length;
}

module.exports = strlen;
