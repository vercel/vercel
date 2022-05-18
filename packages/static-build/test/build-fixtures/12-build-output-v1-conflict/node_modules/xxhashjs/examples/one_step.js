var XXH = require('..')

var h = XXH.h32( 'abcd', 0xABCD ).toString(16)

console.log( '0x' + h.toUpperCase() )
