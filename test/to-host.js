// Packages
const test = require('ava')

// Utilities
const toHost = require('../src/providers/sh/util/to-host')

test('simple', t => {
  t.is(toHost('zeit.co'), 'zeit.co')
})

test('leading //', t => {
  t.is(toHost('//zeit-logos-rnemgaicnc.now.sh'), 'zeit-logos-rnemgaicnc.now.sh')
})

test('leading http://', t => {
  t.is(
    toHost('http://zeit-logos-rnemgaicnc.now.sh'),
    'zeit-logos-rnemgaicnc.now.sh'
  )
})

test('leading https://', t => {
  t.is(
    toHost('https://zeit-logos-rnemgaicnc.now.sh'),
    'zeit-logos-rnemgaicnc.now.sh'
  )
})

test('leading https:// and path', t => {
  t.is(
    toHost('https://zeit-logos-rnemgaicnc.now.sh/path'),
    'zeit-logos-rnemgaicnc.now.sh'
  )
})

test('simple and path', t => {
  t.is(toHost('zeit.co/test'), 'zeit.co')
})
