const { deepEqual } = require('assert');
const { normalizeRoutes } = require('../');
const {
  getCleanUrls,
  convertCleanUrls,
  convertRedirects,
  convertRewrites,
  convertHeaders,
  convertTrailingSlash,
} = require('../dist/superstatic');

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

test('getCleanUrls', () => {
  const actual = getCleanUrls([
    'file.txt',
    'path/to/file.txt',
    'file.js',
    'path/to/file.js',
    'file.html',
    'path/to/file.html',
  ]);
  const expected = [
    {
      html: '/file.html',
      clean: '/file',
    },
    {
      html: '/path/to/file.html',
      clean: '/path/to/file',
    },
  ];
  deepEqual(actual, expected);
});

test('convertCleanUrls true', () => {
  const actual = convertCleanUrls(true);
  const expected = [
    {
      src: '^/(?:(.+)/)?index(?:\\.html)?/?$',
      headers: { Location: '/$1' },
      status: 301,
    },
    {
      src: '^/(.*)\\.html/?$',
      headers: { Location: '/$1' },
      status: 301,
    },
  ];
  deepEqual(actual, expected);

  const mustMatch = [
    ['/index', '/index.html', '/sub/index', '/sub/index.html'],
    ['/file.html', '/sub/file.html'],
  ];

  const mustNotMatch = [
    [
      '/someindex',
      '/someindex.html',
      '/indexAhtml',
      '/sub/someindex',
      '/sub/someindex.html',
      '/sub/indexAhtml',
    ],
    ['/filehtml', '/sub/filehtml'],
  ];

  assertRegexMatches(actual, mustMatch, mustNotMatch);
});

test('convertCleanUrls true, trailingSlash true', () => {
  const actual = convertCleanUrls(true, true);
  const expected = [
    {
      src: '^/(?:(.+)/)?index(?:\\.html)?/?$',
      headers: { Location: '/$1/' },
      status: 301,
    },
    {
      src: '^/(.*)\\.html/?$',
      headers: { Location: '/$1/' },
      status: 301,
    },
  ];
  deepEqual(actual, expected);

  const mustMatch = [
    [
      '/index',
      '/index.html',
      '/sub/index',
      '/sub/index.html',
      '/index/',
      '/index.html/',
      '/sub/index/',
      '/sub/index.html/',
    ],
    ['/file.html', '/sub/file.html', '/file.html/', '/sub/file.html/'],
  ];

  const mustNotMatch = [
    [
      '/someindex',
      '/someindex.html',
      '/indexAhtml',
      '/sub/someindex',
      '/sub/someindex.html',
      '/sub/indexAhtml',
      '/someindex/',
      '/someindex.html/',
      '/indexAhtml/',
      '/sub/someindex/',
      '/sub/someindex.html/',
      '/sub/indexAhtml/',
    ],
    ['/filehtml', '/sub/filehtml', '/filehtml/', '/sub/filehtml/'],
  ];

  assertRegexMatches(actual, mustMatch, mustNotMatch);
});

test('convertCleanUrls false', () => {
  const actual = convertCleanUrls(false);
  const expected = [];
  deepEqual(actual, expected);
});

test('convertRedirects', () => {
  const actual = convertRedirects([
    { source: '/some/old/path', destination: '/some/new/path' },
    {
      source: '/firebase/(.*)',
      destination: 'https://www.firebase.com',
      statusCode: 302,
    },
    {
      source: '/projects/:id/:action',
      destination: '/projects.html',
    },
    { source: '/old/:segment/path', destination: '/new/path/:segment' },
  ]);

  const expected = [
    {
      src: '^\\/some\\/old\\/path$',
      headers: { Location: '/some/new/path' },
      status: 307,
    },
    {
      src: '^\\/firebase\\/(.*)$',
      headers: { Location: 'https://www.firebase.com' },
      status: 302,
    },
    {
      src: '^\\/projects\\/([^\\/]+?)\\/([^\\/]+?)$',
      headers: { Location: '/projects.html?id=$1&action=$2' },
      status: 307,
    },
    {
      src: '^\\/old\\/([^\\/]+?)\\/path$',
      headers: { Location: '/new/path/$1' },
      status: 307,
    },
  ];

  deepEqual(actual, expected);

  const mustMatch = [
    ['/some/old/path'],
    ['/firebase/one', '/firebase/2', '/firebase/-', '/firebase/dir/sub'],
    ['/projects/one/edit', '/projects/two/edit'],
    ['/old/one/path', '/old/two/path'],
  ];

  const mustNotMatch = [
    ['/nope'],
    ['/fire', '/firebasejumper/two'],
    ['/projects/edit', '/projects/two/three/delete', '/projects'],
    ['/old/path', '/old/two/foo', '/old'],
  ];

  assertRegexMatches(actual, mustMatch, mustNotMatch);
});

test('convertRewrites', () => {
  const actual = convertRewrites([
    { source: '/some/old/path', destination: '/some/new/path' },
    { source: '/firebase/(.*)', destination: 'https://www.firebase.com' },
    { source: '/projects/:id/edit', destination: '/projects.html' },
  ]);

  const expected = [
    { src: '^\\/some\\/old\\/path$', dest: '/some/new/path', check: true },
    {
      src: '^\\/firebase\\/(.*)$',
      dest: 'https://www.firebase.com',
      check: true,
    },
    {
      src: '^\\/projects\\/([^\\/]+?)\\/edit$',
      dest: '/projects.html?id=$1',
      check: true,
    },
  ];

  deepEqual(actual, expected);

  const mustMatch = [
    ['/some/old/path'],
    ['/firebase/one', '/firebase/two'],
    ['/projects/one/edit', '/projects/two/edit'],
    ['/old/one/path', '/old/two/path'],
  ];

  const mustNotMatch = [
    ['/nope'],
    ['/fire', '/firebasejumper/two'],
    ['/projects/edit', '/projects/two/delete', '/projects'],
    ['/old/path', '/old/two/foo', '/old'],
  ];

  assertRegexMatches(actual, mustMatch, mustNotMatch);
});

test('convertHeaders', () => {
  const actual = convertHeaders([
    {
      source: '(.*)+/(.*)\\.(eot|otf|ttf|ttc|woff|font\\.css)',
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
      src: '(.*)+/(.*)\\.(eot|otf|ttf|ttc|woff|font\\.css)',
      headers: { 'Access-Control-Allow-Origin': '*' },
      continue: true,
    },
    {
      src: '404.html',
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
    ['hello/file.jpg', 'hello/font-css', 'dir/arial.font-css'],
    ['403.html', '500.html'],
  ];

  assertRegexMatches(actual, mustMatch, mustNotMatch);
});

test('convertTrailingSlash enabled', () => {
  const actual = convertTrailingSlash(true);
  const expected = [
    {
      src: '^/(.*[^\\/])$',
      headers: { Location: '/$1/' },
      status: 307,
    },
  ];
  deepEqual(actual, expected);

  const mustMatch = [['/index.html', '/dir', '/dir/index.html', '/foo/bar']];

  const mustNotMatch = [['/', '/dir/', '/dir/foo/', '/next.php?page=/']];

  assertRegexMatches(actual, mustMatch, mustNotMatch);
});

test('convertTrailingSlash disabled', () => {
  const actual = convertTrailingSlash(false);
  const expected = [
    {
      src: '^/(.*)\\/$',
      headers: { Location: '/$1' },
      status: 307,
    },
  ];
  deepEqual(actual, expected);

  const mustMatch = [['/dir/', '/index.html/', '/next.php?page=/']];

  const mustNotMatch = [['/dirp', '/mkdir', '/dir/foo']];

  assertRegexMatches(actual, mustMatch, mustNotMatch);
});
