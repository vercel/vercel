function indent(text, n) {
  return text.split('\n').map(l => ' '.repeat(n) + l).join('\n');
}

module.exports = indent;
