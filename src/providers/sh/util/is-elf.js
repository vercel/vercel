const { close, open, read } = require('fs-extra')

module.exports = async function isELF(path) {
  const buf = new Buffer(4)
  const fd = await open(path, 'r')
  await read(fd, buf, 0, buf.length, 0)
  await close(fd);
  return buf.toString() === '\x7fELF'
}
