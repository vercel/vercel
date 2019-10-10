const {
  convertCleanUrls,
  convertRedirects,
  convertRewrites,
  convertHeaders,
  convertTrailingSlash,
} = require('../dist/superstatic');
const { normalizeRoutes } = require('../');
const { deepEqual } = require('assert');

function routesToRegExps(routeArray) {
  const { routes, error } = normalizeRoutes(routeArray);
  if (error) {
    throw error;
  }
  return routes.map(r => new RegExp(r.src));
}

function assertMatches(actual, matches, isExpectingMatch) {
  routesToRegExps(actual).forEach((r, i) => {
    matches[i].forEach(text => {
      deepEqual(r.test(text), isExpectingMatch, `${text} ${r.source}`);
    });
  });
}

function assertRegexMatches(actual, mustMatch, mustNotMatch) {
  assertMatches(actual, mustMatch, true);
  assertMatches(actual, mustNotMatch, false);
}

test('convertCleanUrls', () => {
  const actual = convertCleanUrls([
    'file.txt',
    'path/to/file.txt',
    'file.js',
    'path/to/file.js',
    'file.html',
    'path/to/file.html',
  ]);
  const expected = [
    { src: 'file', dest: 'file.html' },
    { src: 'path/to/file', dest: 'path/to/file.html' },
    {
      src: 'file.html',
      headers: { Location: 'file' },
      status: 301,
    },
    {
      src: 'path/to/file.html',
      headers: { Location: 'path/to/file' },
      status: 301,
    },
  ];
  deepEqual(actual, expected);

  const mustMatch = {
    0: ['file'],
    1: ['path/to/file'],
    2: ['file.html'],
    3: ['path/to/file.html'],
  };

  const mustNotMatch = {
    0: ['file2'],
    1: ['path/to/file2', 'file'],
    2: ['file2.html', 'afile.html'],
    3: ['path/to/file2.html', 'path/to/file'],
  };

  assertRegexMatches(actual, mustMatch, mustNotMatch);
});

test('convertRedirects', () => {
  const actual = convertRedirects([
    { source: '/some/old/path', destination: '/some/new/path' },
    {
      source: '/firebase/*',
      destination: 'https://www.firebase.com',
      type: 302,
    },
    { source: 'app/**', destination: '/application.html' },
    { source: 'projects/*/edit', destination: '/projects.html' },
    { source: '/old/:segment/path', destination: '/new/path/:segment' },
  ]);

  const expected = [
    {
      src: '/some/old/path',
      headers: { Location: '/some/new/path' },
      status: 301,
    },
    {
      src: '/firebase/[^/]+',
      headers: { Location: 'https://www.firebase.com' },
      status: 302,
    },
    { src: 'app/.*', headers: { Location: '/application.html' }, status: 301 },
    {
      src: 'projects/[^/]+/edit',
      headers: { Location: '/projects.html' },
      status: 301,
    },
    {
      src: '/old/(?<segment>[^/]+)/path',
      headers: { Location: '/new/path/$segment' },
      status: 301,
    },
  ];

  deepEqual(actual, expected);

  const mustMatch = {
    0: ['/some/old/path'],
    1: ['/firebase/one', '/firebase/2', '/firebase/-'],
    2: ['app/one', 'app/two'],
    3: ['projects/one/edit', 'projects/two/edit'],
    4: ['/old/one/path', '/old/two/path'],
  };

  const mustNotMatch = {
    0: ['/nope'],
    1: ['/fire', '/firebasejumper/two'],
    2: ['apple', 'apptitude/not'],
    3: ['projects/edit', 'projects/two/delete', 'projects'],
    4: ['/old/path', '/old/two/foo', '/old'],
  };

  assertRegexMatches(actual, mustMatch, mustNotMatch);
});

test('convertRewrites', () => {
  const actual = convertRewrites([
    { source: '/some/old/path', destination: '/some/new/path' },
    { source: '/firebase/*', destination: 'https://www.firebase.com' },
    { source: 'app/**', destination: '/application.html' },
    { source: 'projects/*/edit', destination: '/projects.html' },
  ]);

  const expected = [
    { src: '/some/old/path', dest: '/some/new/path' },
    { src: '/firebase/[^/]+', dest: 'https://www.firebase.com' },
    { src: 'app/.*', dest: '/application.html' },
    { src: 'projects/[^/]+/edit', dest: '/projects.html' },
  ];

  deepEqual(actual, expected);

  const mustMatch = {
    0: ['/some/old/path'],
    1: ['/firebase/one', '/firebase/two'],
    2: ['app/one', 'app/two'],
    3: ['projects/one/edit', 'projects/two/edit'],
    4: ['/old/one/path', '/old/two/path'],
  };
  const mustNotMatch = {
    0: ['/nope'],
    1: ['/fire', '/firebasejumper/two'],
    2: ['apple', 'apptitude/not'],
    3: ['projects/edit', 'projects/two/delete', 'projects'],
    4: ['/old/path', '/old/two/foo', '/old'],
  };

  assertRegexMatches(actual, mustMatch, mustNotMatch);
});

test('convertHeaders', () => {
  const actual = convertHeaders([
    {
      source: '**/*.@(eot|otf|ttf|ttc|woff|font.css)',
      headers: [
        {
          key: 'Access-Control-Allow-Origin',
          value: '*',
        },
      ],
    },
    {
      source: '404.html',
      headers: [
        {
          key: 'Cache-Control',
          value: 'max-age=300',
        },
        {
          key: 'Set-Cookie',
          value: 'error=404',
        },
      ],
    },
  ]);

  const expected = [
    {
      src: '.*\\.(eot|otf|ttf|ttc|woff|font\\.css)',
      headers: { 'Access-Control-Allow-Origin': '*' },
      continue: true,
    },
    {
      src: '404.html',
      headers: { 'Cache-Control': 'max-age=300', 'Set-Cookie': 'error=404' },
      continue: true,
    },
  ];

  // TODO: add this test back once we have a glob to regex
  //deepEqual(actual, expected);

  const mustMatch = {
    0: ['hello/world/file.eot', 'another/font.ttf', 'css/font.css'],
    1: ['404.html'],
  };

  const mustNotMatch = {
    0: ['hello/file.jpg', '/hello/font-css'],
    1: ['403.html', '500.html'],
  };

  assertRegexMatches(actual, mustMatch, mustNotMatch);
});

test('convertTrailingSlash enabled', () => {
  const original = ['index.html', 'dir/index.html', 'dir/sub/index.html'];
  const actual = convertTrailingSlash(original, true);
  const expected = [
    {
      src: 'dir',
      headers: { Location: 'dir/' },
      status: 301,
    },
    {
      src: 'dir/sub',
      headers: { Location: 'dir/sub/' },
      status: 301,
    },
  ];
  deepEqual(actual, expected);

  const mustMatch = {
    0: ['dir'],
    1: ['dir/sub'],
  };

  const mustNotMatch = {
    0: ['dirp', 'mkdir', 'dir/foo'],
    1: ['dirs/sub', 'dir/subs', 'dir/sub/thing'],
  };

  assertRegexMatches(actual, mustMatch, mustNotMatch);
});

test('convertTrailingSlash disabled', () => {
  const original = ['index.html', 'dir/index.html', 'dir/sub/index.html'];
  const actual = convertTrailingSlash(original, false);
  const expected = [
    {
      src: 'dir/',
      headers: { Location: 'dir' },
      status: 301,
    },
    {
      src: 'dir/sub/',
      headers: { Location: 'dir/sub' },
      status: 301,
    },
  ];
  deepEqual(actual, expected);

  const mustMatch = {
    0: ['dir/'],
    1: ['dir/sub/'],
  };

  const mustNotMatch = {
    0: ['dirp', 'mkdir', 'dir/foo'],
    1: ['dirs/sub', 'dir/subs', 'dir/sub/thing'],
  };

  assertRegexMatches(actual, mustMatch, mustNotMatch);
});
