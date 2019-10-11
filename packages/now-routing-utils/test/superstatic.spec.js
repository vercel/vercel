const { deepEqual } = require('assert');
const {
  convertCleanUrls,
  convertRedirects,
  convertRewrites,
  convertHeaders,
  convertTrailingSlash,
  normalizeRoutes,
} = require('../');

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
    { src: 'file', dest: 'file.html', continue: true },
    { src: 'path/to/file', dest: 'path/to/file.html', continue: true },
    {
      src: 'file.html',
      headers: { Location: 'file' },
      status: 301,
      continue: true,
    },
    {
      src: 'path/to/file.html',
      headers: { Location: 'path/to/file' },
      status: 301,
      continue: true,
    },
  ];
  deepEqual(actual, expected);

  const mustMatch = [
    ['file'],
    ['path/to/file'],
    ['file.html'],
    ['path/to/file.html'],
  ];

  const mustNotMatch = [
    ['file2'],
    ['path/to/file2', 'file'],
    ['file2.html', 'afile.html'],
    ['path/to/file2.html', 'path/to/file'],
  ];

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
      continue: true,
    },
    {
      src: '/firebase/[^/]+',
      headers: { Location: 'https://www.firebase.com' },
      status: 302,
      continue: true,
    },
    {
      src: 'app/.*',
      headers: { Location: '/application.html' },
      status: 301,
      continue: true,
    },
    {
      src: 'projects/[^/]+/edit',
      headers: { Location: '/projects.html' },
      status: 301,
      continue: true,
    },
    {
      src: '/old/(?<segment>[^/]+)/path',
      headers: { Location: '/new/path/$segment' },
      status: 301,
      continue: true,
    },
  ];

  deepEqual(actual, expected);

  const mustMatch = [
    ['/some/old/path'],
    ['/firebase/one', '/firebase/2', '/firebase/-'],
    ['app/one', 'app/two'],
    ['projects/one/edit', 'projects/two/edit'],
    ['/old/one/path', '/old/two/path'],
  ];

  const mustNotMatch = [
    ['/nope'],
    ['/fire', '/firebasejumper/two', '/firebase/dir/subdir'],
    ['apple', 'apptitude/not'],
    ['projects/edit', 'projects/two/delete', 'projects'],
    ['/old/path', '/old/two/foo', '/old'],
  ];

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
    { src: '/some/old/path', dest: '/some/new/path', continue: true },
    {
      src: '/firebase/[^/]+',
      dest: 'https://www.firebase.com',
      continue: true,
    },
    { src: 'app/.*', dest: '/application.html', continue: true },
    { src: 'projects/[^/]+/edit', dest: '/projects.html', continue: true },
  ];

  deepEqual(actual, expected);

  const mustMatch = [
    ['/some/old/path'],
    ['/firebase/one', '/firebase/two'],
    ['app/one', 'app/two'],
    ['projects/one/edit', 'projects/two/edit'],
    ['/old/one/path', '/old/two/path'],
  ];

  const mustNotMatch = [
    ['/nope'],
    ['/fire', '/firebasejumper/two'],
    ['apple', 'apptitude/not'],
    ['projects/edit', 'projects/two/delete', 'projects'],
    ['/old/path', '/old/two/foo', '/old'],
  ];

  assertRegexMatches(actual, mustMatch, mustNotMatch);
});

test('convertHeaders', () => {
  const actual = convertHeaders([
    {
      source: '**/*.@(eot|ttf|woff|font.css)',
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
      src: '.*/[^/]+\\.(eot|ttf|woff|font\\.css)',
      headers: { 'Access-Control-Allow-Origin': '*' },
      continue: true,
    },
    {
      src: '404\\.html',
      headers: { 'Cache-Control': 'max-age=300', 'Set-Cookie': 'error=404' },
      continue: true,
    },
  ];

  deepEqual(actual, expected);

  const mustMatch = [
    ['hello/world/file.eot', 'another/font.ttf', 'dir/arial.font.css'],
    ['404.html'],
  ];

  const mustNotMatch = [
    ['hello/file.jpg', '/hello/font-css', 'dir/arial.font-css'],
    ['403.html', '500.html'],
  ];

  assertRegexMatches(actual, mustMatch, mustNotMatch);
});

test('convertTrailingSlash enabled', () => {
  const actual = convertTrailingSlash(true);
  const expected = [
    {
      src: '^(.*[^\\/])$',
      headers: { Location: '$1/' },
      status: 301,
      continue: true,
    },
  ];
  deepEqual(actual, expected);

  const mustMatch = [['index.html', 'dir', 'dir/index.html', 'foo/bar']];

  const mustNotMatch = [['/', 'dir/', 'dir/foo/', 'next.php?page=/']];

  assertRegexMatches(actual, mustMatch, mustNotMatch);
});

test('convertTrailingSlash disabled', () => {
  const actual = convertTrailingSlash(false);
  const expected = [
    {
      src: '^(.*)\\/$',
      headers: { Location: '$1' },
      status: 301,
      continue: true,
    },
  ];
  deepEqual(actual, expected);

  const mustMatch = [['dir/', 'index.html/', 'next.php?page=/']];

  const mustNotMatch = [['dirp', 'mkdir', 'dir/foo']];

  assertRegexMatches(actual, mustMatch, mustNotMatch);
});
