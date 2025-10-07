import { deepEqual } from 'assert';
import { Route, RouteWithSrc, normalizeRoutes } from '../src';
import {
  getCleanUrls,
  convertCleanUrls,
  convertRedirects,
  convertRewrites,
  convertHeaders,
  convertTrailingSlash,
} from '../src/superstatic';

function routesToRegExps(routeArray: Route[]) {
  const { routes, error } = normalizeRoutes(routeArray);
  if (error) {
    throw error;
  }
  return (routes || [])
    .filter((r): r is RouteWithSrc => 'src' in r)
    .map(r => new RegExp(r.src));
}

function assertMatches(
  actual: Route[],
  matches: string[][],
  isExpectingMatch: boolean
) {
  routesToRegExps(actual).forEach((r, i) => {
    matches[i].forEach(text => {
      deepEqual(r.test(text), isExpectingMatch, `${text} ${r.source}`);
    });
  });
}

function assertRegexMatches(
  actual: Route[],
  mustMatch: string[][],
  mustNotMatch: string[][]
) {
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
      status: 308,
    },
    {
      src: '^/(.*)\\.html/?$',
      headers: { Location: '/$1' },
      status: 308,
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
      status: 308,
    },
    {
      src: '^/(.*)\\.html/?$',
      headers: { Location: '/$1/' },
      status: 308,
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
  const expected: Route[] = [];
  deepEqual(actual, expected);
});

test('convertRedirects', () => {
  const actual = convertRedirects([
    {
      source: '/(.*)',
      has: [{ type: 'host', value: '(?<subdomain>.*)-test.vercel.app' }],
      destination: 'https://:subdomain.example.com/some-path/end?a=b',
    },
    { source: '/some/old/path', destination: '/some/new/path' },
    { source: '/next(\\.js)?', destination: 'https://nextjs.org' },
    {
      source: '/proxy/(.*)',
      destination: 'https://www.firebase.com',
      statusCode: 302,
    },
    {
      source: '/proxy-regex/([a-zA-Z]{1,})',
      destination: 'https://firebase.com/$1',
    },
    {
      source: '/proxy-port/([a-zA-Z]{1,})',
      destination: 'https://firebase.com:8080/$1',
    },
    {
      source: '/projects/:id/:action',
      destination: '/projects.html',
    },
    { source: '/old/:segment/path', destination: '/new/path/:segment' },
    { source: '/catchall/:hello*', destination: '/catchall/:hello*/' },
    {
      source: '/another-catch/:hello+',
      destination: '/another-catch/:hello+/',
    },
    {
      source: '/feedback/((?!general).*)',
      destination: '/feedback/general',
    },
    { source: '/catchme/:id*', destination: '/api/user' },
    {
      source: '/hello/:world*',
      destination: '/something#:world*',
    },
    {
      source: '/external/:id',
      destination:
        'https://example.com/?utm_source=google.com#/guides/:id/page?dynamic=code',
    },
    {
      source: '/optional/:id?',
      destination: '/api/optional/:id?',
    },
    {
      source: '/feature-{:slug}',
      destination: '/blog-{:slug}',
    },
    {
      source: '/hello/:world',
      destination: '/somewhere?else={:world}',
    },
    {
      source: '/hello/:first',
      destination: '/another/:a/:b',
      has: [
        {
          type: 'host',
          value: '(?<a>.*)\\.(?<b>.*)',
        },
      ],
      permanent: false,
    },
    {
      source: '/hello/:first',
      destination: '/another',
      missing: [
        {
          type: 'host',
          value: '(?<a>.*)\\.(?<b>.*)',
        },
      ],
      permanent: false,
    },
    {
      source: '/hello/:first',
      destination:
        '/another/:first/:username/:pathname/:another/:host/:a/:b/:c/:d',
      has: [
        {
          type: 'header',
          key: 'x-rewrite',
        },
        {
          type: 'cookie',
          key: 'loggedIn',
          value: '1',
        },
        {
          type: 'host',
          value: 'vercel.com',
        },
        {
          type: 'host',
          value: '(?<a>.*)\\.(?<b>.*)',
        },
        {
          type: 'header',
          key: 'host',
          value: '(?<c>.*)\\.(?<d>.*)',
        },
        {
          type: 'query',
          key: 'username',
        },
        {
          type: 'header',
          key: 'x-pathname',
          value: '(?<pathname>.*)',
        },
        {
          type: 'header',
          key: 'X-Pathname',
          value: '(?<another>hello|world)',
        },
      ],
      permanent: false,
    },
  ]);

  const expected = [
    {
      has: [
        {
          type: 'host',
          value: '(?<subdomain>.*)-test.vercel.app',
        },
      ],
      headers: {
        Location: 'https://$subdomain.example.com/some-path/end?a=b',
      },
      src: '^(?:\\/(.*))$',
      status: 308,
    },
    {
      src: '^\\/some\\/old\\/path$',
      headers: { Location: '/some/new/path' },
      status: 308,
    },
    {
      src: '^\\/next(\\.js)?$',
      headers: { Location: 'https://nextjs.org' },
      status: 308,
    },
    {
      src: '^\\/proxy(?:\\/(.*))$',
      headers: { Location: 'https://www.firebase.com' },
      status: 302,
    },
    {
      src: '^\\/proxy-regex(?:\\/([a-zA-Z]{1,}))$',
      headers: { Location: 'https://firebase.com/$1' },
      status: 308,
    },
    {
      src: '^\\/proxy-port(?:\\/([a-zA-Z]{1,}))$',
      headers: { Location: 'https://firebase.com:8080/$1' },
      status: 308,
    },
    {
      src: '^\\/projects(?:\\/([^\\/]+?))(?:\\/([^\\/]+?))$',
      headers: { Location: '/projects.html' },
      status: 308,
    },
    {
      src: '^\\/old(?:\\/([^\\/]+?))\\/path$',
      headers: { Location: '/new/path/$1' },
      status: 308,
    },
    {
      src: '^\\/catchall(?:\\/((?:[^\\/]+?)(?:\\/(?:[^\\/]+?))*))?$',
      headers: { Location: '/catchall/$1/' },
      status: 308,
    },
    {
      src: '^\\/another-catch(?:\\/((?:[^\\/]+?)(?:\\/(?:[^\\/]+?))*))$',
      headers: { Location: '/another-catch/$1/' },
      status: 308,
    },
    {
      src: '^\\/feedback(?:\\/((?!general).*))$',
      headers: { Location: '/feedback/general' },
      status: 308,
    },
    {
      src: '^\\/catchme(?:\\/((?:[^\\/]+?)(?:\\/(?:[^\\/]+?))*))?$',
      headers: { Location: '/api/user' },
      status: 308,
    },
    {
      src: '^\\/hello(?:\\/((?:[^\\/]+?)(?:\\/(?:[^\\/]+?))*))?$',
      headers: { Location: '/something#$1' },
      status: 308,
    },
    {
      src: '^\\/external(?:\\/([^\\/]+?))$',
      headers: {
        Location:
          'https://example.com/?utm_source=google.com#/guides/$1/page?dynamic=code',
      },
      status: 308,
    },
    {
      src: '^\\/optional(?:\\/([^\\/]+?))?$',
      headers: { Location: '/api/optional/$1' },
      status: 308,
    },
    {
      headers: {
        Location: '/blog-$1',
      },
      src: '^\\/feature-([^\\/]+?)$',
      status: 308,
    },
    {
      headers: {
        Location: '/somewhere?else=$1',
      },
      src: '^\\/hello(?:\\/([^\\/]+?))$',
      status: 308,
    },
    {
      has: [
        {
          type: 'host',
          value: '(?<a>.*)\\.(?<b>.*)',
        },
      ],
      headers: {
        Location: '/another/$a/$b',
      },
      src: '^\\/hello(?:\\/([^\\/]+?))$',
      status: 307,
    },
    {
      missing: [
        {
          type: 'host',
          value: '(?<a>.*)\\.(?<b>.*)',
        },
      ],
      headers: {
        Location: '/another',
      },
      src: '^\\/hello(?:\\/([^\\/]+?))$',
      status: 307,
    },
    {
      has: [
        {
          key: 'x-rewrite',
          type: 'header',
        },
        {
          key: 'loggedIn',
          type: 'cookie',
          value: '1',
        },
        {
          type: 'host',
          value: 'vercel.com',
        },
        {
          type: 'host',
          value: '(?<a>.*)\\.(?<b>.*)',
        },
        {
          key: 'host',
          type: 'header',
          value: '(?<c>.*)\\.(?<d>.*)',
        },
        {
          key: 'username',
          type: 'query',
        },
        {
          key: 'x-pathname',
          type: 'header',
          value: '(?<pathname>.*)',
        },
        {
          type: 'header',
          key: 'x-pathname',
          value: '(?<another>hello|world)',
        },
      ],
      headers: {
        Location: '/another/$1/$username/$pathname/$another/$host/$a/$b/$c/$d',
      },
      src: '^\\/hello(?:\\/([^\\/]+?))$',
      status: 307,
    },
  ];

  deepEqual(actual, expected);

  const mustMatch = [
    ['/hello'],
    ['/some/old/path'],
    ['/next', '/next.js'],
    ['/proxy/one', '/proxy/2', '/proxy/-', '/proxy/dir/sub'],
    ['/proxy-regex/admin', '/proxy-regex/anotherAdmin'],
    ['/proxy-port/admin', '/proxy-port/anotherAdmin'],
    ['/projects/one/edit', '/projects/two/edit'],
    ['/old/one/path', '/old/two/path'],
    ['/catchall/first', '/catchall/first/second'],
    ['/another-catch/first', '/another-catch/first/second'],
    ['/feedback/another'],
    ['/catchme/id-1', '/catchme/id/2'],
    ['/hello/world', '/hello/another/world'],
    ['/external/1', '/external/2'],
    ['/optional', '/optional/1'],
    ['/feature-first', '/feature-second'],
    ['/hello/world', '/hello/again'],
    ['/hello/world'],
    ['/hello/world'],
    ['/hello/world'],
  ];

  const mustNotMatch = [
    [],
    ['/nope'],
    ['/nextAjs', '/nextjs'],
    ['/prox', '/proxyed/two'],
    ['/proxy-regex/user/1', '/proxy-regex/another/1'],
    ['/proxy-port/user/1', '/proxy-port/another/1'],
    ['/projects/edit', '/projects/two/three/delete', '/projects'],
    ['/old/path', '/old/two/foo', '/old'],
    ['/random-catch'],
    ['/another-catch'],
    ['/feedback/general'],
    ['/catchm', '/random'],
    ['/not-this-one', '/helloo'],
    ['/externalnope', '/externally'],
    ['/optionalnope', '/optionally'],
    ['/feature/first', '/feature'],
    ['/hello', '/hello/another/one'],
    ['/hellooo'],
    ['/hellooo'],
    ['/helloooo'],
  ];

  assertRegexMatches(actual, mustMatch, mustNotMatch);
});

test('convertRewrites', () => {
  const actual = convertRewrites(
    [
      { source: '/some/old/path', destination: '/some/new/path' },
      { source: '/proxy/(.*)', destination: 'https://www.firebase.com' },
      { source: '/proxy/(.*)', destination: 'https://www.firebase.com/' },
      {
        source: '/proxy-regex/([a-zA-Z]{1,})',
        destination: 'https://firebase.com/$1',
      },
      {
        source: '/proxy-port/([a-zA-Z]{1,})',
        destination: 'https://firebase.com:8080/$1',
      },
      { source: '/projects/:id/edit', destination: '/projects.html' },
      {
        source: '/users/:id',
        destination: '/api/user?identifier=:id&version=v2',
      },
      {
        source: '/:file/:id',
        destination: '/:file/get?identifier=:id',
      },
      {
        source: '/qs-and-hash/:id/:hash',
        destination: '/api/get?identifier=:id#:hash',
      },
      {
        source: '/fullurl',
        destination:
          'https://user:pass@sub.example.com:8080/path/goes/here?v=1&id=2#hash',
      },
      {
        source: '/dont-override-qs/:name/:age',
        destination: '/final?name=bob&age=',
      },
      { source: '/catchall/:hello*/', destination: '/catchall/:hello*' },
      {
        source: '/another-catch/:hello+/',
        destination: '/another-catch/:hello+',
      },
      { source: '/catchme/:id*', destination: '/api/user' },
      { source: '/:path', destination: '/test?path=:path' },
      { source: '/:path/:two', destination: '/test?path=:path' },
      { source: '/(.*)-:id(\\d+).html', destination: '/blog/:id' },
      {
        source: '/feature-{:slug}',
        destination: '/blog-{:slug}',
      },
      {
        source: '/hello/:world',
        destination: '/somewhere?else={:world}',
      },
      {
        source: '/hello/:first',
        destination: '/another/:a/:b',
        has: [
          {
            type: 'host',
            value: '(?<a>.*)\\.(?<b>.*)',
          },
        ],
      },
      {
        source: '/hello/:first',
        destination:
          '/another/:first/:username/:pathname/:another/:host/:a/:b/:c/:d',
        has: [
          {
            type: 'header',
            key: 'x-rewrite',
          },
          {
            type: 'cookie',
            key: 'loggedIn',
            value: '1',
          },
          {
            type: 'host',
            value: 'vercel.com',
          },
          {
            type: 'host',
            value: '(?<a>.*)\\.(?<b>.*)',
          },
          {
            type: 'header',
            key: 'host',
            value: '(?<c>.*)\\.(?<d>.*)',
          },
          {
            type: 'query',
            key: 'username',
          },
          {
            type: 'header',
            key: 'x-pathname',
            value: '(?<pathname>.*)',
          },
          {
            type: 'header',
            key: 'X-Pathname',
            value: '(?<another>hello|world)',
          },
        ],
      },
      {
        source: '/hello/:first',
        destination: '/another',
        missing: [
          {
            type: 'header',
            key: 'x-rewrite',
          },
          {
            type: 'cookie',
            key: 'loggedIn',
            value: '1',
          },
          {
            type: 'host',
            value: 'vercel.com',
          },
          {
            type: 'host',
            value: '(?<a>.*)\\.(?<b>.*)',
          },
          {
            type: 'header',
            key: 'host',
            value: '(?<c>.*)\\.(?<d>.*)',
          },
          {
            type: 'query',
            key: 'username',
          },
          {
            type: 'header',
            key: 'x-pathname',
            value: '(?<pathname>.*)',
          },
          {
            type: 'header',
            key: 'X-Pathname',
            value: '(?<another>hello|world)',
          },
        ],
      },
      {
        source: '/array-query-string/:id/:name',
        destination: 'https://example.com/?tag=1&tag=2',
      },
      {
        source: '/:nextInternalLocale/:path',
        destination: '/api/hello',
      },
      {
        source: '/rewrite-with-status',
        destination: '/api/hello',
        statusCode: 201,
      },
      {
        source: '/test/:id',
        destination: '/api/:sub_domain/:id',
        has: [
          {
            type: 'host',
            value: '(?<sub_domain>.*)\\.example\\.com',
          },
        ],
      },
      {
        source: '/user/:id',
        destination: '/api/:user_name/:user_type/:id',
        has: [
          {
            type: 'header',
            key: 'x-data',
            value: '(?<user_name>.*)-(?<user_type>.*)',
          },
        ],
      },
      {
        source: '/item/:id',
        destination: '/products/:item_id/:category/:id',
        has: [
          {
            type: 'query',
            key: 'data',
            value: '(?<item_id>\\d+)-(?<category>[a-z]+)',
          },
        ],
      },
    ],
    ['nextInternalLocale']
  );

  const expected = [
    { src: '^\\/some\\/old\\/path$', dest: '/some/new/path', check: true },
    {
      src: '^\\/proxy(?:\\/(.*))$',
      dest: 'https://www.firebase.com/',
      check: true,
    },
    {
      src: '^\\/proxy(?:\\/(.*))$',
      dest: 'https://www.firebase.com/',
      check: true,
    },
    {
      src: '^\\/proxy-regex(?:\\/([a-zA-Z]{1,}))$',
      dest: 'https://firebase.com/$1',
      check: true,
    },
    {
      src: '^\\/proxy-port(?:\\/([a-zA-Z]{1,}))$',
      dest: 'https://firebase.com:8080/$1',
      check: true,
    },
    {
      src: '^\\/projects(?:\\/([^\\/]+?))\\/edit$',
      dest: '/projects.html?id=$1',
      check: true,
    },
    {
      src: '^\\/users(?:\\/([^\\/]+?))$',
      dest: '/api/user?identifier=$1&version=v2&id=$1',
      check: true,
    },
    {
      src: '^(?:\\/([^\\/]+?))(?:\\/([^\\/]+?))$',
      dest: '/$1/get?identifier=$2',
      check: true,
    },
    {
      src: '^\\/qs-and-hash(?:\\/([^\\/]+?))(?:\\/([^\\/]+?))$',
      dest: '/api/get?identifier=$1#$2',
      check: true,
    },
    {
      src: '^\\/fullurl$',
      dest: 'https://user:pass@sub.example.com:8080/path/goes/here?v=1&id=2#hash',
      check: true,
    },
    {
      src: '^\\/dont-override-qs(?:\\/([^\\/]+?))(?:\\/([^\\/]+?))$',
      dest: '/final?name=bob&age=',
      check: true,
    },
    {
      src: '^\\/catchall(?:\\/((?:[^\\/]+?)(?:\\/(?:[^\\/]+?))*))?\\/$',
      dest: '/catchall/$1',
      check: true,
    },
    {
      src: '^\\/another-catch(?:\\/((?:[^\\/]+?)(?:\\/(?:[^\\/]+?))*))\\/$',
      dest: '/another-catch/$1',
      check: true,
    },
    {
      src: '^\\/catchme(?:\\/((?:[^\\/]+?)(?:\\/(?:[^\\/]+?))*))?$',
      dest: '/api/user?id=$1',
      check: true,
    },
    {
      src: '^(?:\\/([^\\/]+?))$',
      dest: '/test?path=$1',
      check: true,
    },
    {
      check: true,
      dest: '/test?path=$1&two=$2',
      src: '^(?:\\/([^\\/]+?))(?:\\/([^\\/]+?))$',
    },
    { check: true, dest: '/blog/$2', src: '^(?:\\/(.*))-(\\d+)\\.html$' },
    {
      dest: '/blog-$1',
      src: '^\\/feature-([^\\/]+?)$',
      check: true,
    },
    {
      dest: '/somewhere?else=$1&world=$1',
      src: '^\\/hello(?:\\/([^\\/]+?))$',
      check: true,
    },
    {
      check: true,
      dest: '/another/$a/$b',
      has: [
        {
          type: 'host',
          value: '(?<a>.*)\\.(?<b>.*)',
        },
      ],
      src: '^\\/hello(?:\\/([^\\/]+?))$',
    },
    {
      check: true,
      dest: '/another/$1/$username/$pathname/$another/$host/$a/$b/$c/$d',
      has: [
        {
          key: 'x-rewrite',
          type: 'header',
        },
        {
          key: 'loggedIn',
          type: 'cookie',
          value: '1',
        },
        {
          type: 'host',
          value: 'vercel.com',
        },
        {
          type: 'host',
          value: '(?<a>.*)\\.(?<b>.*)',
        },
        {
          key: 'host',
          type: 'header',
          value: '(?<c>.*)\\.(?<d>.*)',
        },
        {
          type: 'query',
          key: 'username',
        },
        {
          type: 'header',
          key: 'x-pathname',
          value: '(?<pathname>.*)',
        },
        {
          type: 'header',
          key: 'x-pathname',
          value: '(?<another>hello|world)',
        },
      ],
      src: '^\\/hello(?:\\/([^\\/]+?))$',
    },
    {
      check: true,
      dest: '/another?first=$1',
      missing: [
        {
          key: 'x-rewrite',
          type: 'header',
        },
        {
          key: 'loggedIn',
          type: 'cookie',
          value: '1',
        },
        {
          type: 'host',
          value: 'vercel.com',
        },
        {
          type: 'host',
          value: '(?<a>.*)\\.(?<b>.*)',
        },
        {
          key: 'host',
          type: 'header',
          value: '(?<c>.*)\\.(?<d>.*)',
        },
        {
          type: 'query',
          key: 'username',
        },
        {
          type: 'header',
          key: 'x-pathname',
          value: '(?<pathname>.*)',
        },
        {
          type: 'header',
          key: 'x-pathname',
          value: '(?<another>hello|world)',
        },
      ],
      src: '^\\/hello(?:\\/([^\\/]+?))$',
    },
    {
      src: '^\\/array-query-string(?:\\/([^\\/]+?))(?:\\/([^\\/]+?))$',
      dest: 'https://example.com/?tag=1&tag=2&id=$1&name=$2',
      check: true,
    },
    {
      check: true,
      dest: '/api/hello?nextInternalLocale=$1&path=$2',
      src: '^(?:\\/([^\\/]+?))(?:\\/([^\\/]+?))$',
    },
    {
      check: true,
      dest: '/api/hello',
      src: '^\\/rewrite-with-status$',
      status: 201,
    },
    {
      check: true,
      dest: '/api/$sub_domain/$1',
      has: [
        {
          type: 'host',
          value: '(?<sub_domain>.*)\\.example\\.com',
        },
      ],
      src: '^\\/test(?:\\/([^\\/]+?))$',
    },
    {
      check: true,
      dest: '/api/$user_name/$user_type/$1',
      has: [
        {
          type: 'header',
          key: 'x-data',
          value: '(?<user_name>.*)-(?<user_type>.*)',
        },
      ],
      src: '^\\/user(?:\\/([^\\/]+?))$',
    },
    {
      check: true,
      dest: '/products/$item_id/$category/$1',
      has: [
        {
          type: 'query',
          key: 'data',
          value: '(?<item_id>\\d+)-(?<category>[a-z]+)',
        },
      ],
      src: '^\\/item(?:\\/([^\\/]+?))$',
    },
  ];

  deepEqual(actual, expected);

  const mustMatch = [
    ['/some/old/path'],
    ['/proxy/one', '/proxy/two'],
    ['/proxy/one', '/proxy/two'],
    ['/proxy-regex/admin', '/proxy-regex/anotherAdmin'],
    ['/proxy-port/admin', '/proxy-port/anotherAdmin'],
    ['/projects/one/edit', '/projects/two/edit'],
    ['/users/four', '/users/five'],
    ['/file1/yep', '/file2/nope'],
    ['/qs-and-hash/test/first', '/qs-and-hash/test/second'],
    ['/fullurl'],
    ['/dont-override-qs/bob/42', '/dont-override-qs/alice/29'],
    ['/catchall/first/', '/catchall/first/second/'],
    ['/another-catch/first/', '/another-catch/first/second/'],
    ['/catchme/id-1', '/catchme/id/2'],
    ['/first', '/another'],
    ['/first/second', '/one/two'],
    ['/hello/post-123.html', '/post-123.html'],
    ['/feature-first', '/feature-second'],
    ['/hello/world', '/hello/again'],
    ['/hello/world'],
    ['/hello/world'],
    ['/hello/world'],
    ['/array-query-string/10/email'],
    ['/en/hello'],
    ['/rewrite-with-status'],
    ['/test/123', '/test/abc'],
    ['/user/10', '/user/abc'],
    ['/item/5', '/item/xyz'],
  ];

  const mustNotMatch = [
    ['/nope'],
    ['/prox', '/proxyed/two'],
    ['/prox', '/proxyed/two'],
    ['/proxy-regex/user/1', '/proxy-regex/another/1'],
    ['/proxy-port/user/1', '/proxy-port/another/1'],
    ['/projects/edit', '/projects/two/delete', '/projects'],
    ['/users/edit/four', '/users/five/delete', '/users'],
    ['/'],
    ['/qs-and-hash', '/qs-and-hash/onlyone'],
    ['/full'],
    ['/dont-override-qs', '/dont-override-qs/nope'],
    ['/random-catch/'],
    ['/another-catch/'],
    ['/catchm', '/random'],
    ['/another/one'],
    ['/not', '/these'],
    ['/hello/post.html'],
    ['/feature/first', '/feature'],
    ['/hello', '/hello/another/one'],
    ['/hllooo'],
    ['/hllooo'],
    ['/hllooo'],
    ['/array-query-string/10'],
    ['/en/hello/world', '/en/hello/'],
    ['/rewrite-with-status-nope'],
    ['/test', '/testing/123', '/test/'],
    ['/user', '/users/10', '/user/'],
    ['/item', '/items/5', '/item/'],
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
    {
      source: '/blog/:path*',
      headers: [
        {
          key: 'on-blog',
          value: ':path*',
        },
        {
          key: ':path*',
          value: 'blog',
        },
      ],
    },
    {
      source: '/like/params/:path',
      headers: [
        {
          key: 'x-path',
          value: ':path',
        },
        {
          key: 'some:path',
          value: 'hi',
        },
        {
          key: 'x-test',
          value: 'some:value*',
        },
        {
          key: 'x-test-2',
          value: 'value*',
        },
        {
          key: 'x-test-3',
          value: ':value?',
        },
        {
          key: 'x-test-4',
          value: ':value+',
        },
        {
          key: 'x-test-5',
          value: 'something https:',
        },
        {
          key: 'x-test-6',
          value: ':hello(world)',
        },
        {
          key: 'x-test-7',
          value: 'hello(world)',
        },
        {
          key: 'x-test-8',
          value: 'hello{1,}',
        },
        {
          key: 'x-test-9',
          value: ':hello{1,2}',
        },
        {
          key: 'content-security-policy',
          value:
            "default-src 'self'; img-src *; media-src media1.com media2.com; script-src userscripts.example.com/:path",
        },
      ],
    },
    {
      source: '/hello/:first',
      has: [
        {
          type: 'host',
          value: '(?<a>.*)\\.(?<b>.*)',
        },
      ],
      headers: [
        {
          key: 'x-a',
          value: ':a',
        },
        {
          key: 'x-:b',
          value: 'b',
        },
      ],
    },
    {
      source: '/hello/:first',
      missing: [
        {
          type: 'host',
          value: '(?<a>.*)\\.(?<b>.*)',
        },
      ],
      headers: [
        {
          key: 'x-a',
          value: 'a',
        },
        {
          key: 'x-b',
          value: 'b',
        },
      ],
    },
    {
      source: '/hello/:first',
      has: [
        {
          key: 'x-rewrite',
          type: 'header',
        },
        {
          key: 'loggedIn',
          type: 'cookie',
          value: '1',
        },
        {
          type: 'host',
          value: 'vercel.com',
        },
        {
          type: 'host',
          value: '(?<a>.*)\\.(?<b>.*)',
        },
        {
          key: 'host',
          type: 'header',
          value: '(?<c>.*)\\.(?<d>.*)',
        },
        {
          type: 'query',
          key: 'username',
        },
        {
          type: 'header',
          key: 'x-pathname',
          value: '(?<pathname>.*)',
        },
        {
          type: 'header',
          key: 'X-Pathname',
          value: '(?<another>hello|world)',
        },
      ],
      headers: [
        {
          key: 'x-header',
          value: 'something',
        },
        {
          key: 'x-user',
          value: ':username',
        },
        {
          key: 'x-another',
          value: ':another',
        },
        {
          key: 'x-a',
          value: ':a',
        },
        {
          key: 'x-:b',
          value: 'b',
        },
        {
          key: 'x-c',
          value: ':c',
        },
        {
          key: 'x-:d',
          value: 'd',
        },
      ],
    },
    {
      source: '/(.*)',
      headers: [
        {
          key: 'Content-Security-Policy',
          value:
            "frame-ancestors 'self' https://test-app.vercel.app https://:shop;",
        },
      ],
      has: [
        {
          type: 'query',
          key: 'shop',
        },
      ],
    },
  ]);

  const expected = [
    {
      src: '^(.*)+(?:\\/(.*))\\.(eot|otf|ttf|ttc|woff|font\\.css)$',
      headers: { 'Access-Control-Allow-Origin': '*' },
      continue: true,
    },
    {
      src: '^404\\.html$',
      headers: { 'Cache-Control': 'max-age=300', 'Set-Cookie': 'error=404' },
      continue: true,
    },
    {
      src: '^\\/blog(?:\\/((?:[^\\/]+?)(?:\\/(?:[^\\/]+?))*))?$',
      headers: { 'on-blog': '$1', $1: 'blog' },
      continue: true,
    },
    {
      continue: true,
      headers: {
        'content-security-policy':
          "default-src 'self'; img-src *; media-src media1.com media2.com; script-src userscripts.example.com/$1",
        some$1: 'hi',
        'x-path': '$1',
        'x-test': 'some:value*',
        'x-test-2': 'value*',
        'x-test-3': ':value?',
        'x-test-4': ':value+',
        'x-test-5': 'something https:',
        'x-test-6': ':hello(world)',
        'x-test-7': 'hello(world)',
        'x-test-8': 'hello{1,}',
        'x-test-9': ':hello{1,2}',
      },
      src: '^\\/like\\/params(?:\\/([^\\/]+?))$',
    },
    {
      continue: true,
      has: [
        {
          type: 'host',
          value: '(?<a>.*)\\.(?<b>.*)',
        },
      ],
      headers: {
        'x-a': '$a',
        'x-$b': 'b',
      },
      src: '^\\/hello(?:\\/([^\\/]+?))$',
    },
    {
      continue: true,
      missing: [
        {
          type: 'host',
          value: '(?<a>.*)\\.(?<b>.*)',
        },
      ],
      headers: {
        'x-a': 'a',
        'x-b': 'b',
      },
      src: '^\\/hello(?:\\/([^\\/]+?))$',
    },
    {
      continue: true,
      has: [
        {
          key: 'x-rewrite',
          type: 'header',
        },
        {
          key: 'loggedIn',
          type: 'cookie',
          value: '1',
        },
        {
          type: 'host',
          value: 'vercel.com',
        },
        {
          type: 'host',
          value: '(?<a>.*)\\.(?<b>.*)',
        },
        {
          key: 'host',
          type: 'header',
          value: '(?<c>.*)\\.(?<d>.*)',
        },
        {
          type: 'query',
          key: 'username',
        },
        {
          type: 'header',
          key: 'x-pathname',
          value: '(?<pathname>.*)',
        },
        {
          type: 'header',
          key: 'x-pathname',
          value: '(?<another>hello|world)',
        },
      ],
      src: '^\\/hello(?:\\/([^\\/]+?))$',
      headers: {
        'x-header': 'something',
        'x-user': '$username',
        'x-another': '$another',
        'x-a': '$a',
        'x-$b': 'b',
        'x-c': '$c',
        'x-$d': 'd',
      },
    },
    {
      continue: true,
      has: [
        {
          key: 'shop',
          type: 'query',
        },
      ],
      headers: {
        'Content-Security-Policy':
          "frame-ancestors 'self' https://test-app.vercel.app https://$shop;",
      },
      src: '^(?:\\/(.*))$',
    },
  ];

  deepEqual(actual, expected);

  const mustMatch = [
    ['hello/world/file.eot', 'another/font.ttf', 'dir/arial.font.css'],
    ['404.html'],
    ['/blog/first-post', '/blog/another/one'],
    ['/like/params/first', '/like/params/second'],
    ['/hello/world'],
    ['/hello/world'],
    ['/hello/world'],
    ['/hello'],
  ];

  const mustNotMatch = [
    ['hello/file.jpg', 'hello/font-css', 'dir/arial.font-css'],
    ['403.html', '500.html'],
    ['/blogg', '/random'],
    ['/non-match', '/like/params', '/like/params/'],
    ['/hellooo'],
    ['/hellooo'],
    ['/hellooo'],
    [],
  ];

  assertRegexMatches(actual, mustMatch, mustNotMatch);
});

test('convertTrailingSlash enabled', () => {
  const actual = convertTrailingSlash(true);
  const expected = [
    { src: '^/\\.well-known(?:/.*)?$' },
    {
      src: '^/((?:[^/]+/)*[^/\\.]+)$',
      headers: { Location: '/$1/' },
      status: 308,
    },
    {
      src: '^/((?:[^/]+/)*[^/]+\\.\\w+)/$',
      headers: { Location: '/$1' },
      status: 308,
    },
  ];
  deepEqual(actual, expected);

  const mustMatch = [
    [
      '/.well-known',
      '/.well-known/',
      '/.well-known/asdf',
      '/.well-known/asdf/',
    ],
    ['/dir', '/dir/foo', '/dir/foo/bar'],
    ['/foo.html/', '/dir/foo.html/', '/dir/foo/bar.css/', '/dir/about.map.js/'],
  ];

  const mustNotMatch = [
    [
      '/swell-known',
      '/swell-known/',
      '/swell-known/asdf',
      '/swell-known/asdf/',
    ],
    [
      '/',
      '/index.html',
      '/asset/style.css',
      '/asset/about.map.js',
      '/dir/',
      '/dir/foo/',
      '/next.php?page=/',
    ],
    [
      '/',
      '/foo.html',
      '/dir/foo.html',
      '/dir/foo/bar.css',
      '/dir/about.map.js',
    ],
  ];

  assertRegexMatches(actual, mustMatch, mustNotMatch);
});

test('convertTrailingSlash disabled', () => {
  const actual = convertTrailingSlash(false);
  const expected = [
    {
      src: '^/(.*)\\/$',
      headers: { Location: '/$1' },
      status: 308,
    },
  ];
  deepEqual(actual, expected);

  const mustMatch = [['/dir/', '/index.html/', '/next.php?page=/']];

  const mustNotMatch = [['/dirp', '/mkdir', '/dir/foo']];

  assertRegexMatches(actual, mustMatch, mustNotMatch);
});
