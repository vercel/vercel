/* eslint-disable no-var */

// Native
var path = require('path')
var fs = require('fs')

var dist = path.join(__dirname, 'dist')
var now = path.join(dist, 'now')

fs.writeFileSync(
  now,
  '#!/usr/bin/env node\n' +
    'console.log("\'Now\' binary downloading was interrupted. Please reinstall!")\n'
)
