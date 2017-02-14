// Native
const os = require('os')

// Ours
const {version} = require('../lib/pkg')

module.exports = `now ${version} node-${process.version} ${os.platform()} (${os.arch()})`
