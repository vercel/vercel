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
    { src: '/some/old/path', dest: '/some/new/path' },
    { src: '/firebase/[^/]+', dest: 'https://www.firebase.com' },
    { src: 'app/.*', dest: '/application.html' },
    { src: 'projects/[^/]+/edit', dest: '/projects.html' },
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

  const mustMatch = [['dir'], ['dir/sub']];

  const mustNotMatch = [
    ['dirp', 'mkdir', 'dir/foo'],
    ['dirs/sub', 'dir/subs', 'dir/sub/thing'],
  ];

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

  const mustMatch = [['dir/'], ['dir/sub/']];

  const mustNotMatch = [
    ['dirp', 'mkdir', 'dir/foo'],
    ['dirs/sub', 'dir/subs', 'dir/sub/thing'],
  ];

  assertRegexMatches(actual, mustMatch, mustNotMatch);
});
