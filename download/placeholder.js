/* eslint-disable no-var */

// Native
var path = require('path')
var fs = require('fs')

var now = path.join(__dirname, 'dist', 'now')

fs.writeFileSync(
  now,
  '#!/usr/bin/env node\n' +
    'console.log("\'Now\' binary downloading was interrupted. Please reinstall!")\n'
)
