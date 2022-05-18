var XXH = require('..')
var buf = require('fs').readFileSync( process.argv[2] )

// var buf = buf.toString()
console.log('data loaded:', buf.length, 'bytes')
var startTime = Date.now()
var h = XXH.h64(0).update(buf).digest()
var delta = Date.now() - startTime
console.log( '0x' + h.toString(16).toUpperCase(), 'in', delta, 'ms' )
