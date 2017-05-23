/* eslint-disable no-var */

// Native
var path = require('path')
var fs = require('fs')

var dist = path.join(__dirname, 'dist')
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
