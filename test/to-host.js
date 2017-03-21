const test = require('ava');
const toHost = require('../build/lib/to-host');

test('simple', async t => {
  t.is(toHost('zeit.co'), 'zeit.co');
});

test('leading //', async t => {
  t.is(
    toHost('//zeit-logos-rnemgaicnc.now.sh'),
    'zeit-logos-rnemgaicnc.now.sh'
  );
});

test('leading http://', async t => {
  t.is(
    toHost('http://zeit-logos-rnemgaicnc.now.sh'),
    'zeit-logos-rnemgaicnc.now.sh'
  );
});

test('leading https://', async t => {
  t.is(
    toHost('https://zeit-logos-rnemgaicnc.now.sh'),
    'zeit-logos-rnemgaicnc.now.sh'
  );
});

test('leading https:// and path', async t => {
  t.is(
    toHost('https://zeit-logos-rnemgaicnc.now.sh/path'),
    'zeit-logos-rnemgaicnc.now.sh'
  );
});

test('simple and path', async t => {
  t.is(toHost('zeit.co/test'), 'zeit.co');
});
