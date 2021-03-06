const assert = require('assert');
const Ajv = require('ajv');
const {
  normalizeRoutes,
  isHandler,
  routesSchema,
  rewritesSchema,
  redirectsSchema,
  headersSchema,
  cleanUrlsSchema,
  trailingSlashSchema,
  getTransformedRoutes,
} = require('../');

const ajv = new Ajv();
const assertValid = (data, schema = routesSchema) => {
  const validate = ajv.compile(schema);
  const valid = validate(data);

  if (!valid) console.log(validate.errors);
  assert.equal(valid, true);
};
const assertError = (data, errors, schema = routesSchema) => {
  const validate = ajv.compile(schema);
  const valid = validate(data);

  assert.equal(valid, false);
  assert.deepEqual(validate.errors, errors);
};

describe('normalizeRoutes', () => {
  test('should return routes null if provided routes is null', () => {
    const actual = normalizeRoutes(null);
    assert.equal(actual.routes, null);
  });

  test('accepts valid routes', () => {
    const routes = [
      {
        src: '^(?:/(?<value>en|fr))?(?<path>/.*)$',
        locale: {
          value: '$value',
          path: '$path',
          default: 'en',
          cookie: 'NEXT_LOCALE',
        },
      },
      {
        src: '^/(?:en/?|fr/?)$',
        locale: {
          redirect: { en: '/en', fr: '/fr' },
        },
      },
      { src: '^/about$' },
      {
        src: '^/blog$',
        methods: ['GET'],
        headers: { 'Cache-Control': 'no-cache' },
        dest: '/blog',
      },
      { handle: 'filesystem' },
      { src: '^/(?<slug>[^/]+)$', dest: 'blog?slug=$slug' },
      { handle: 'hit' },
      {
        src: '^/hit-me$',
        headers: { 'Cache-Control': 'max-age=20' },
        continue: true,
      },
      { handle: 'miss' },
      { src: '^/missed-me$', dest: '/api/missed-me', check: true },
      {
        src: '^/missed-me$',
        headers: { 'Cache-Control': 'max-age=10' },
        continue: true,
        important: true,
      },
      { handle: 'rewrite' },
      { src: '^.*$', dest: '/somewhere' },
      { handle: 'error' },
      {
        src: '^.*$',
        dest: '/404',
        status: 404,
      },
    ];

    assertValid(routes);

    const normalized = normalizeRoutes(routes);
    assert.equal(normalized.error, null);
    assert.deepStrictEqual(normalized.routes, routes);
  });

  test('normalizes src', () => {
    const expected = '^/about$';
    const sources = [
      { src: '/about' },
      { src: '/about$' },
      { src: '\\/about' },
      { src: '\\/about$' },
      { src: '^/about' },
      { src: '^/about$' },
      { src: '^\\/about' },
      { src: '^\\/about$' },
    ];

    assertValid(sources);

    const normalized = normalizeRoutes(sources);

    assert.equal(normalized.error, null);
    assert.notEqual(normalized.routes, null);

    if (normalized.routes) {
      normalized.routes.forEach(route => {
        if (isHandler(route)) {
          assert.fail(
            `Normalizer returned: { handle: ${route.handle} } instead of { src: ${expected} }`
          );
        } else {
          assert.strictEqual(route.src, expected);
        }
      });
    }
  });

  test('returns if null', () => {
    const input = null;
    const { error, routes } = normalizeRoutes(input);

    assert.strictEqual(error, null);
    assert.strictEqual(routes, input);
  });

  test('returns if empty', () => {
    const input = [];
    const { error, routes } = normalizeRoutes(input);

    assert.strictEqual(error, null);
    assert.strictEqual(routes, input);
  });

  test('fails if route has unknown `handle` value', () => {
    const input = [{ handle: 'doesnotexist' }];
    const { error } = normalizeRoutes(input);

    assert.deepEqual(error.code, 'invalid_route');
    assert.deepEqual(
      error.message,
      'Route at index 0 has unknown handle value `handle: doesnotexist`.'
    );
  });

  test('fails if route has additional properties with `handle` property', () => {
    const input = [{ handle: 'filesystem', illegal: true }];
    const { error } = normalizeRoutes(input);

    assert.deepEqual(error.code, 'invalid_route');
    assert.deepEqual(
      error.message,
      'Route at index 0 has unknown property `illegal`.'
    );
  });

  test('fails if route has a duplicate `handle` value', () => {
    const input = [{ handle: 'filesystem' }, { handle: 'filesystem' }];
    const { error } = normalizeRoutes(input);

    assert.deepEqual(error.code, 'invalid_route');
    assert.deepEqual(
      error.message,
      'Route at index 1 is a duplicate. Please use one `handle: filesystem` at most.'
    );
  });

  test('fails if route has a invalid regex', () => {
    const input = [{ src: '^/(broken]$' }];
    const { error } = normalizeRoutes(input);

    assert.deepEqual(error.code, 'invalid_route');
    assert.deepEqual(
      error.message,
      'Route at index 0 has invalid `src` regular expression "^/(broken]$".'
    );
  });

  test('fails if route does not define `handle` or `src` property', () => {
    const input = [{ fake: 'foo' }];
    const { error } = normalizeRoutes(input);

    assert.deepEqual(error.code, 'invalid_route');
    assert.deepEqual(
      error.message,
      'Route at index 0 must define either `handle` or `src` property.'
    );
  });

  test('fails if over 1024 routes', () => {
    // @ts-ignore
    assertError('string', [
      {
        dataPath: '',
        keyword: 'type',
        message: 'should be array',
        params: {
          type: 'array',
        },
        schemaPath: '#/type',
      },
    ]);

    const arr = new Array(1026);
    arr.fill(true);

    // @ts-ignore
    assertError(arr, [
      {
        dataPath: '',
        keyword: 'maxItems',
        message: 'should NOT have more than 1024 items',
        params: {
          limit: '1024',
        },
        schemaPath: '#/maxItems',
      },
    ]);
  });

  test('fails is src is not string', () => {
    assertError(
      [
        // @ts-ignore
        {
          src: false,
        },
      ],
      [
        {
          keyword: 'type',
          dataPath: '[0].src',
          schemaPath: '#/items/anyOf/0/properties/src/type',
          params: { type: 'string' },
          message: 'should be string',
        },
        {
          keyword: 'additionalProperties',
          dataPath: '[0]',
          schemaPath: '#/items/anyOf/1/additionalProperties',
          params: { additionalProperty: 'src' },
          message: 'should NOT have additional properties',
        },
        {
          keyword: 'anyOf',
          dataPath: '[0]',
          schemaPath: '#/items/anyOf',
          params: {},
          message: 'should match some schema in anyOf',
        },
      ]
    );
  });

  test('fails if dest is not string', () => {
    assertError(
      [
        // @ts-ignore
        {
          dest: false,
        },
      ],
      [
        {
          keyword: 'required',
          dataPath: '[0]',
          schemaPath: '#/items/anyOf/0/required',
          params: { missingProperty: 'src' },
          message: "should have required property 'src'",
        },
        {
          keyword: 'additionalProperties',
          dataPath: '[0]',
          schemaPath: '#/items/anyOf/1/additionalProperties',
          params: { additionalProperty: 'dest' },
          message: 'should NOT have additional properties',
        },
        {
          keyword: 'anyOf',
          dataPath: '[0]',
          schemaPath: '#/items/anyOf',
          params: {},
          message: 'should match some schema in anyOf',
        },
      ]
    );
  });

  test('fails if methods is not array', () => {
    assertError(
      [
        // @ts-ignore
        {
          methods: false,
        },
      ],
      [
        {
          keyword: 'required',
          dataPath: '[0]',
          schemaPath: '#/items/anyOf/0/required',
          params: { missingProperty: 'src' },
          message: "should have required property 'src'",
        },
        {
          keyword: 'additionalProperties',
          dataPath: '[0]',
          schemaPath: '#/items/anyOf/1/additionalProperties',
          params: { additionalProperty: 'methods' },
          message: 'should NOT have additional properties',
        },
        {
          keyword: 'anyOf',
          dataPath: '[0]',
          schemaPath: '#/items/anyOf',
          params: {},
          message: 'should match some schema in anyOf',
        },
      ]
    );
  });

  test('fails if methods is not string', () => {
    assertError(
      [
        // @ts-ignore
        {
          methods: [false],
        },
      ],
      [
        {
          keyword: 'required',
          dataPath: '[0]',
          schemaPath: '#/items/anyOf/0/required',
          params: { missingProperty: 'src' },
          message: "should have required property 'src'",
        },
        {
          keyword: 'additionalProperties',
          dataPath: '[0]',
          schemaPath: '#/items/anyOf/1/additionalProperties',
          params: { additionalProperty: 'methods' },
          message: 'should NOT have additional properties',
        },
        {
          keyword: 'anyOf',
          dataPath: '[0]',
          schemaPath: '#/items/anyOf',
          params: {},
          message: 'should match some schema in anyOf',
        },
      ]
    );
  });

  test('fails if headers is not an object', () => {
    assertError(
      [
        // @ts-ignore
        {
          headers: false,
        },
      ],
      [
        {
          keyword: 'required',
          dataPath: '[0]',
          schemaPath: '#/items/anyOf/0/required',
          params: { missingProperty: 'src' },
          message: "should have required property 'src'",
        },
        {
          keyword: 'additionalProperties',
          dataPath: '[0]',
          schemaPath: '#/items/anyOf/1/additionalProperties',
          params: { additionalProperty: 'headers' },
          message: 'should NOT have additional properties',
        },
        {
          keyword: 'anyOf',
          dataPath: '[0]',
          schemaPath: '#/items/anyOf',
          params: {},
          message: 'should match some schema in anyOf',
        },
      ]
    );
  });

  test('fails if header is not a string', () => {
    assertError(
      [
        // @ts-ignore
        {
          headers: {
            test: false,
          },
        },
      ],
      [
        {
          keyword: 'required',
          dataPath: '[0]',
          schemaPath: '#/items/anyOf/0/required',
          params: { missingProperty: 'src' },
          message: "should have required property 'src'",
        },
        {
          keyword: 'additionalProperties',
          dataPath: '[0]',
          schemaPath: '#/items/anyOf/1/additionalProperties',
          params: { additionalProperty: 'headers' },
          message: 'should NOT have additional properties',
        },
        {
          keyword: 'anyOf',
          dataPath: '[0]',
          schemaPath: '#/items/anyOf',
          params: {},
          message: 'should match some schema in anyOf',
        },
      ]
    );
  });

  test('fails if handle is not string', () => {
    assertError(
      [
        // @ts-ignore
        {
          handle: false,
        },
      ],
      [
        {
          keyword: 'additionalProperties',
          dataPath: '[0]',
          schemaPath: '#/items/anyOf/0/additionalProperties',
          params: { additionalProperty: 'handle' },
          message: 'should NOT have additional properties',
        },
        {
          keyword: 'type',
          dataPath: '[0].handle',
          schemaPath: '#/items/anyOf/1/properties/handle/type',
          params: { type: 'string' },
          message: 'should be string',
        },
        {
          keyword: 'anyOf',
          dataPath: '[0]',
          schemaPath: '#/items/anyOf',
          params: {},
          message: 'should match some schema in anyOf',
        },
      ]
    );
  });

  test('fails if continue is not boolean', () => {
    assertError(
      [
        // @ts-ignore
        {
          continue: 'false',
        },
      ],
      [
        {
          keyword: 'required',
          dataPath: '[0]',
          schemaPath: '#/items/anyOf/0/required',
          params: { missingProperty: 'src' },
          message: "should have required property 'src'",
        },
        {
          keyword: 'additionalProperties',
          dataPath: '[0]',
          schemaPath: '#/items/anyOf/1/additionalProperties',
          params: { additionalProperty: 'continue' },
          message: 'should NOT have additional properties',
        },
        {
          keyword: 'anyOf',
          dataPath: '[0]',
          schemaPath: '#/items/anyOf',
          params: {},
          message: 'should match some schema in anyOf',
        },
      ]
    );
  });

  test('fails if check is not boolean', () => {
    assertError(
      [
        // @ts-ignore
        {
          check: 'false',
        },
      ],
      [
        {
          keyword: 'required',
          dataPath: '[0]',
          schemaPath: '#/items/anyOf/0/required',
          params: { missingProperty: 'src' },
          message: "should have required property 'src'",
        },
        {
          keyword: 'additionalProperties',
          dataPath: '[0]',
          schemaPath: '#/items/anyOf/1/additionalProperties',
          params: { additionalProperty: 'check' },
          message: 'should NOT have additional properties',
        },
        {
          keyword: 'anyOf',
          dataPath: '[0]',
          schemaPath: '#/items/anyOf',
          params: {},
          message: 'should match some schema in anyOf',
        },
      ]
    );
  });

  test('fails if status is not number', () => {
    assertError(
      [
        // @ts-ignore
        {
          status: '404',
        },
      ],
      [
        {
          keyword: 'required',
          dataPath: '[0]',
          schemaPath: '#/items/anyOf/0/required',
          params: { missingProperty: 'src' },
          message: "should have required property 'src'",
        },
        {
          keyword: 'additionalProperties',
          dataPath: '[0]',
          schemaPath: '#/items/anyOf/1/additionalProperties',
          params: { additionalProperty: 'status' },
          message: 'should NOT have additional properties',
        },
        {
          keyword: 'anyOf',
          dataPath: '[0]',
          schemaPath: '#/items/anyOf',
          params: {},
          message: 'should match some schema in anyOf',
        },
      ]
    );
  });

  test('fails if property does not exist', () => {
    assertError(
      [
        {
          // @ts-ignore
          doesNotExist: false,
        },
      ],
      [
        {
          keyword: 'additionalProperties',
          dataPath: '[0]',
          schemaPath: '#/items/anyOf/0/additionalProperties',
          params: { additionalProperty: 'doesNotExist' },
          message: 'should NOT have additional properties',
        },
        {
          keyword: 'additionalProperties',
          dataPath: '[0]',
          schemaPath: '#/items/anyOf/1/additionalProperties',
          params: { additionalProperty: 'doesNotExist' },
          message: 'should NOT have additional properties',
        },
        {
          keyword: 'anyOf',
          dataPath: '[0]',
          schemaPath: '#/items/anyOf',
          params: {},
          message: 'should match some schema in anyOf',
        },
      ]
    );
  });

  test('fails if redirects permanent is not a boolean', () => {
    assertError(
      [
        {
          source: '/foo',
          destination: '/bar',
          permanent: 301,
        },
      ],
      [
        {
          dataPath: '[0].permanent',
          keyword: 'type',
          message: 'should be boolean',
          params: {
            type: 'boolean',
          },
          schemaPath: '#/items/properties/permanent/type',
        },
      ],
      redirectsSchema
    );
  });

  test('fails if redirects statusCode is not a number', () => {
    assertError(
      [
        {
          source: '/foo',
          destination: '/bar',
          statusCode: '301',
        },
      ],
      [
        {
          dataPath: '[0].statusCode',
          keyword: 'type',
          message: 'should be integer',
          params: {
            type: 'integer',
          },
          schemaPath: '#/items/properties/statusCode/type',
        },
      ],
      redirectsSchema
    );
  });

  test('fails if routes after `handle: hit` use `dest`', () => {
    const input = [
      {
        handle: 'hit',
      },
      {
        src: '^/user$',
        dest: '^/api/user$',
      },
    ];
    const { error } = normalizeRoutes(input);

    assert.deepEqual(error.code, 'invalid_route');
    assert.deepEqual(
      error.message,
      'Route at index 1 cannot define `dest` after `handle: hit`.'
    );
  });

  test('fails if routes after `handle: hit` do not use `continue: true`', () => {
    const input = [
      {
        handle: 'hit',
      },
      {
        src: '^/user$',
        headers: { 'Cache-Control': 'no-cache' },
      },
    ];
    const { error } = normalizeRoutes(input);

    assert.deepEqual(error.code, 'invalid_route');
    assert.deepEqual(
      error.message,
      'Route at index 1 must define `continue: true` after `handle: hit`.'
    );
  });

  test('fails if routes after `handle: hit` use `status', () => {
    const input = [
      {
        handle: 'hit',
      },
      {
        src: '^/(.*)$',
        status: 404,
        continue: true,
      },
    ];
    const { error } = normalizeRoutes(input);

    assert.deepEqual(error.code, 'invalid_route');
    assert.deepEqual(
      error.message,
      'Route at index 1 cannot define `status` after `handle: hit`.'
    );
  });

  test('fails if routes after `handle: miss` do not use `check: true`', () => {
    const input = [
      {
        handle: 'miss',
      },
      {
        src: '^/user$',
        dest: '^/api/user$',
      },
    ];
    const { error } = normalizeRoutes(input);

    assert.deepEqual(error.code, 'invalid_route');
    assert.deepEqual(
      error.message,
      'Route at index 1 must define `check: true` after `handle: miss`.'
    );
  });

  test('fails if routes after `handle: miss` do not use `continue: true`', () => {
    const input = [
      {
        handle: 'miss',
      },
      {
        src: '^/user$',
        headers: { 'Cache-Control': 'no-cache' },
      },
    ];
    const { error } = normalizeRoutes(input);

    assert.deepEqual(error.code, 'invalid_route');
    assert.deepEqual(
      error.message,
      'Route at index 1 must define `continue: true` after `handle: miss`.'
    );
  });
});

describe('getTransformedRoutes', () => {
  test('should normalize nowConfig.routes', () => {
    const nowConfig = { routes: [{ src: '/page', dest: '/page.html' }] };
    const actual = getTransformedRoutes({ nowConfig });
    const expected = normalizeRoutes(nowConfig.routes);
    assert.deepEqual(actual, expected);
    assertValid(actual.routes);
  });

  test('should not error when routes is null and cleanUrls is true', () => {
    const nowConfig = { cleanUrls: true, routes: null };
    const actual = getTransformedRoutes({ nowConfig });
    assert.equal(actual.error, null);
    assertValid(actual.routes);
  });

  test('should error when routes is defined and cleanUrls is true', () => {
    const nowConfig = {
      cleanUrls: true,
      routes: [{ src: '/page', dest: '/file.html' }],
    };
    const actual = getTransformedRoutes({ nowConfig });
    assert.notEqual(actual.error, null);
    assert.equal(actual.error.code, 'invalid_mixed_routes');
    assert.equal(
      actual.error.message,
      'If `rewrites`, `redirects`, `headers`, `cleanUrls` or `trailingSlash` are used, then `routes` cannot be present.'
    );
    assert.ok(actual.error.link);
    assert.ok(actual.error.action);
  });

  test('should error when redirects is invalid regex', () => {
    const nowConfig = {
      redirects: [{ source: '^/(*.)\\.html$', destination: '/file.html' }],
    };
    const actual = getTransformedRoutes({ nowConfig });
    assert.notEqual(actual.error, null);
    assert.equal(actual.error.code, 'invalid_redirect');
    assert.equal(
      actual.error.message,
      'Redirect at index 0 has invalid `source` regular expression "^/(*.)\\.html$".'
    );
    assert.ok(actual.error.link);
    assert.ok(actual.error.action);
  });

  test('should error when redirects is invalid pattern', () => {
    const nowConfig = {
      redirects: [{ source: '/:?', destination: '/file.html' }],
    };
    const actual = getTransformedRoutes({ nowConfig });
    assert.notEqual(actual.error, null);
    assert.equal(actual.error.code, 'invalid_redirect');
    assert.equal(
      actual.error.message,
      'Redirect at index 0 has invalid `source` pattern "/:?".'
    );
    assert.ok(actual.error.link);
    assert.ok(actual.error.action);
  });

  test('should error when redirects defines both permanent and statusCode', () => {
    const nowConfig = {
      redirects: [
        {
          source: '^/both$',
          destination: '/api/both',
          permanent: false,
          statusCode: 302,
        },
      ],
    };
    const actual = getTransformedRoutes({ nowConfig });
    assert.notEqual(actual.error, null);
    assert.equal(actual.error.code, 'invalid_redirect');
    assert.equal(
      actual.error.message,
      'Redirect at index 0 cannot define both `permanent` and `statusCode` properties.'
    );
    assert.ok(actual.error.link);
    assert.ok(actual.error.action);
  });

  test('should error when headers is invalid regex', () => {
    const nowConfig = {
      headers: [{ source: '^/(*.)\\.html$', destination: '/file.html' }],
    };
    const actual = getTransformedRoutes({ nowConfig });
    assert.notEqual(actual.error, null);
    assert.equal(actual.error.code, 'invalid_header');
    assert.equal(
      actual.error.message,
      'Header at index 0 has invalid `source` regular expression "^/(*.)\\.html$".'
    );
    assert.ok(actual.error.link);
    assert.ok(actual.error.action);
  });

  test('should error when headers is invalid pattern', () => {
    const nowConfig = {
      headers: [
        { source: '/:?', headers: [{ key: 'x-hello', value: 'world' }] },
      ],
    };
    const actual = getTransformedRoutes({ nowConfig });
    assert.notEqual(actual.error, null);
    assert.equal(actual.error.code, 'invalid_header');
    assert.equal(
      actual.error.message,
      'Header at index 0 has invalid `source` pattern "/:?".'
    );
    assert.ok(actual.error.link);
    assert.ok(actual.error.action);
  });

  test('should error when rewrites is invalid regex', () => {
    const nowConfig = {
      rewrites: [{ source: '^/(*.)\\.html$', destination: '/file.html' }],
    };
    const actual = getTransformedRoutes({ nowConfig });
    assert.notEqual(actual.error, null);
    assert.equal(actual.error.code, 'invalid_rewrite');
    assert.equal(
      actual.error.message,
      'Rewrite at index 0 has invalid `source` regular expression "^/(*.)\\.html$".'
    );
    assert.ok(actual.error.link);
    assert.ok(actual.error.action);
  });

  test('should error when rewrites is invalid pattern', () => {
    const nowConfig = {
      rewrites: [{ source: '/:?', destination: '/file.html' }],
    };
    const actual = getTransformedRoutes({ nowConfig });
    assert.notEqual(actual.error, null);
    assert.equal(actual.error.code, 'invalid_rewrite');
    assert.equal(
      actual.error.message,
      'Rewrite at index 0 has invalid `source` pattern "/:?".'
    );
    assert.ok(actual.error.link);
    assert.ok(actual.error.action);
  });

  test('should normalize all redirects before rewrites', () => {
    const nowConfig = {
      cleanUrls: true,
      rewrites: [{ source: '/v1', destination: '/v2/api.py' }],
      redirects: [
        { source: '/help', destination: '/support', statusCode: 302 },
        {
          source: '/bug',
          destination: 'https://example.com/bug',
          statusCode: 308,
        },
      ],
    };
    const actual = getTransformedRoutes({ nowConfig });
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
      {
        src: '^/help$',
        headers: { Location: '/support' },
        status: 302,
      },
      {
        src: '^/bug$',
        headers: { Location: 'https://example.com/bug' },
        status: 308,
      },
      { handle: 'filesystem' },
      { src: '^/v1$', dest: '/v2/api.py', check: true },
    ];
    assert.deepEqual(actual.error, null);
    assert.deepEqual(actual.routes, expected);
    assertValid(actual.routes, routesSchema);
  });

  test('should validate schemas', () => {
    const nowConfig = {
      cleanUrls: true,
      rewrites: [
        { source: '/page', destination: '/page.html' },
        { source: '/home', destination: '/index.html' },
      ],
      redirects: [
        { source: '/version1', destination: '/api1.py' },
        { source: '/version2', destination: '/api2.py', statusCode: 302 },
        { source: '/version3', destination: '/api3.py', permanent: true },
      ],
      headers: [
        {
          source: '/(.*)',
          headers: [
            {
              key: 'Access-Control-Allow-Origin',
              value: '*',
            },
          ],
        },
        {
          source: '/404',
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
      ],
      trailingSlashSchema: false,
    };
    assertValid(nowConfig.cleanUrls, cleanUrlsSchema);
    assertValid(nowConfig.rewrites, rewritesSchema);
    assertValid(nowConfig.redirects, redirectsSchema);
    assertValid(nowConfig.headers, headersSchema);
    assertValid(nowConfig.trailingSlashSchema, trailingSlashSchema);
  });

  test('should return null routes if no transformations are performed', () => {
    const nowConfig = { routes: null };
    const actual = getTransformedRoutes({ nowConfig });
    assert.equal(actual.routes, null);
  });

  test('should error when segment is defined in `destination` but not `source`', () => {
    const nowConfig = {
      redirects: [
        {
          source: '/iforgot/:id',
          destination: '/:another',
        },
      ],
    };
    const actual = getTransformedRoutes({ nowConfig });
    assert.deepEqual(actual.routes, null);
    assert.ok(
      actual.error.message.includes(
        'in `destination` property but not in `source` property'
      ),
      actual.error.message
    );
  });

  test('should error when segment is defined in HTTPS `destination` but not `source`', () => {
    const nowConfig = {
      redirects: [
        {
          source: '/iforgot/:id',
          destination: 'https://example.com/:another',
        },
      ],
    };
    const actual = getTransformedRoutes({ nowConfig });
    assert.deepEqual(actual.routes, null);
    assert.ok(
      actual.error.message.includes(
        'in `destination` property but not in `source` property'
      ),
      actual.error.message
    );
  });

  test('should error when segment is defined in `destination` query string but not `source`', () => {
    const nowConfig = {
      redirects: [
        {
          source: '/iforgot/:id',
          destination: '/api/login?id=123&name=:name',
        },
      ],
    };
    const actual = getTransformedRoutes({ nowConfig });
    assert.deepEqual(actual.routes, null);
    assert.ok(
      actual.error.message.includes(
        'in `destination` property but not in `source` property'
      ),
      actual.error.message
    );
  });

  test('should error when segment is defined in HTTPS `destination` query string but not `source`', () => {
    const nowConfig = {
      redirects: [
        {
          source: '/iforgot/:id',
          destination: 'https://example.com/api/login?id=123&name=:name',
        },
      ],
    };
    const actual = getTransformedRoutes({ nowConfig });
    assert.deepEqual(actual.routes, null);
    assert.ok(
      actual.error.message.includes(
        'in `destination` property but not in `source` property'
      ),
      actual.error.message
    );
  });

  test('should work with content-security-policy header containing URL', () => {
    const nowConfig = {
      headers: [
        {
          source: '/(.*)',
          headers: [
            {
              key: 'content-security-policy',
              value:
                "default-src 'self'; script-src 'self'; img-src 'self' https://*.example.com; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.examplpe.com wss://gateway.example.com; form-action 'self'",
            },
            {
              key: 'feature-policy',
              value:
                "accelerometer 'none'; camera 'none'; geolocation 'none'; gyroscope 'none'; magnetometer 'none'; microphone 'none'; payment 'none'; usb 'none'",
            },
            {
              key: 'referrer-policy',
              value: 'strict-origin-when-cross-origin',
            },
            {
              key: 'strict-transport-security',
              value: 'max-age=31536000; includesubdomains; preload',
            },
            {
              key: 'x-content-type-options',
              value: 'nosniff',
            },
            {
              key: 'x-frame-options',
              value: 'sameorigin',
            },
            {
              key: 'x-xss-protection',
              value: '1; mode=block',
            },
          ],
        },
      ],
    };
    const actual = getTransformedRoutes({ nowConfig });
    assert.deepEqual(actual.routes, [
      {
        continue: true,
        headers: {
          'content-security-policy':
            "default-src 'self'; script-src 'self'; img-src 'self' https://*.example.com; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.examplpe.com wss://gateway.example.com; form-action 'self'",
          'feature-policy':
            "accelerometer 'none'; camera 'none'; geolocation 'none'; gyroscope 'none'; magnetometer 'none'; microphone 'none'; payment 'none'; usb 'none'",
          'referrer-policy': 'strict-origin-when-cross-origin',
          'strict-transport-security':
            'max-age=31536000; includesubdomains; preload',
          'x-content-type-options': 'nosniff',
          'x-frame-options': 'sameorigin',
          'x-xss-protection': '1; mode=block',
        },
        src: '^(?:/(.*))$',
      },
    ]);
  });
});
