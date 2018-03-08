module.exports = stdout => stdout.split('\n').filter(line => {
  return line.includes('.now.sh')
}).map(line => {
  return line.split(' ').filter(part => part.includes('.now.sh'))[0]
})
