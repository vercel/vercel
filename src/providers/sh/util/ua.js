// node
const os = require('os')

// ours
const { version } = require('./pkg')

module.exports = `now ${version} node-${process.version} ${os.platform()} (${os.arch()})`
