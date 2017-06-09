/* eslint-disable no-var */

// Native
var path = require('path')
var fs = require('fs')

var dist = path.join(__dirname, 'dist')
var src = path.join(__dirname, 'src')

// Don't install when developing locally
if (fs.existsSync(src)) {
  process.exit(0)
}

var download = path.join(dist, 'download.js')

try {
  fs.mkdirSync(dist)
} catch (err) {
  if (err.code !== 'EEXIST') {
    throw err
  }
}

fs.closeSync(
  fs.openSync(download, 'a')
)

require(download)
