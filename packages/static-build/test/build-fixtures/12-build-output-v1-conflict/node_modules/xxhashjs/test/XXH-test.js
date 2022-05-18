var assert = require('assert')
var XXH = require('..')

describe('XXH', function () {
	var seed = 0

	describe('with small input multiple of 4', function () {
		var input = 'abcd'
		var expected = 'A3643705' // Computed with xxHash C version

		it('should return hash in a single step', function (done) {
			var h = XXH.h32( input, seed ).toString(16).toUpperCase()

			assert.equal( h, expected )
			done()
		})

		it('should return hash in many steps', function (done) {
			var H = XXH.h32( seed )
			var h = H.update( input ).digest().toString(16).toUpperCase()

			assert.equal( h, expected )
			done()
		})

	})

	describe('with medium input multiple of 4', function () {
		var input = Array(1001).join('abcd')
		var expected = 'E18CBEA'

		it('should return hash in a single step', function (done) {
			var h = XXH.h32( input, seed ).toString(16).toUpperCase()

			assert.equal( h, expected )
			done()
		})

		it('should return hash in many steps', function (done) {
			var H = XXH.h32( seed )
			var h = H.update( input ).digest().toString(16).toUpperCase()

			assert.equal( h, expected )
			done()
		})

	})

	describe('with small input', function () {
		var input = 'abc'
		var expected = '32D153FF' // Computed with xxHash C version

		it('should return hash in a single step', function (done) {
			var h = XXH.h32( input, seed ).toString(16).toUpperCase()

			assert.equal( h, expected )
			done()
		})

		it('should return hash in many steps', function (done) {
			var H = XXH.h32( seed )
			var h = H.update( input ).digest().toString(16).toUpperCase()

			assert.equal( h, expected )
			done()
		})

	})

	describe('with medium input', function () {
		var input = Array(1000).join('abc')
		var expected = '89DA9B6E'

		it('should return hash in a single step', function (done) {
			var h = XXH.h32( input, seed ).toString(16).toUpperCase()

			assert.equal( h, expected )
			done()
		})

		it('should return hash in many steps', function (done) {
			var H = XXH.h32( seed )
			var h = H.update( input ).digest().toString(16).toUpperCase()

			assert.equal( h, expected )
			done()
		})

	})

	describe('with split medium input', function () {
		var input = Array(1000).join('abc')
		var expected = '89DA9B6E'

		it('should return hash with split input < 16', function (done) {
			var H = XXH.h32( seed )
			var h = H
				.update( input.slice(0, 10) )
				.update( input.slice(10) )
				.digest().toString(16).toUpperCase()

			assert.equal( h, expected )
			done()
		})

		it('should return hash with split input = 16', function (done) {
			var H = XXH.h32( seed )
			var h = H
				.update( input.slice(0, 16) )
				.update( input.slice(16) )
				.digest().toString(16).toUpperCase()

			assert.equal( h, expected )
			done()
		})

		it('should return hash with split input > 16', function (done) {
			var H = XXH.h32( seed )
			var h = H
				.update( input.slice(0, 20) )
				.update( input.slice(20) )
				.digest().toString(16).toUpperCase()

			assert.equal( h, expected )
			done()
		})

	})

	describe('with utf-8 strings', function () {
		var input = 'heiå'
		var expected = 'DB5ABCCC' // Computed with xxHash C version

		it('should return hash', function (done) {
			var h = XXH.h32( input, seed ).toString(16).toUpperCase()

			assert.equal( h, expected )
			done()
		})

		it('should return hash in many steps', function (done) {
			var H = XXH.h32( seed )
			var h = H.update( input ).digest().toString(16).toUpperCase()

			assert.equal( h, expected )
			done()
		})

	})

	describe('with utf-8 strings', function () {
		var input = 'κόσμε'
		var expected = 'D855F606' // Computed with xxHash C version

		it('should return hash', function (done) {
			var h = XXH.h32( input, seed ).toString(16).toUpperCase()

			assert.equal( h, expected )
			done()
		})

		it('should return hash in many steps', function (done) {
			var H = XXH.h32( seed )
			var h = H.update( input ).digest().toString(16).toUpperCase()

			assert.equal( h, expected )
			done()
		})

	})

})
