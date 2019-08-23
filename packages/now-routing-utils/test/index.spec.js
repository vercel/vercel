const assert = require('assert');
const Ajv = require('ajv');
const { normalizeRoutes, isHandler, schema } = require('../dist');

const ajv = new Ajv();
const assertValid = (routes) => {
  const validate = ajv.compile(schema);
  const valid = validate(routes);

  if (!valid) console.log(validate.errors);
  assert.equal(valid, true);
};
const assertError = (routes, errors) => {
  const validate = ajv.compile(schema);
  const valid = validate(routes);

  assert.equal(valid, false);
  assert.deepEqual(validate.errors, errors);
};

describe('normalizeRoutes', () => {
  test('accepts valid routes', () => {
    if (Number(process.versions.node.split('.')[0]) < 10) {
      // Skip this test for any Node version less than Node 10
      // which introduced ES2018 RegExp Named Capture Groups.
      // TODO: When now dev integrates this package, we should
      // look at including `pcre-to-regexp`.
      console.log('WARNING: skipping test for Node 8');
      assert.equal(1, 1);
      return;
    }
    const routes = [
      { src: '^/about$' },
      {
        src: '^/blog$',
        methods: ['GET'],
        headers: { 'Cache-Control': 'no-cache' },
        dest: '/blog',
      },
      { handle: 'filesystem' },
      { src: '^/(?<slug>[^/]+)$', dest: 'blog?slug=$slug' },
    ];

    assertValid(routes);

    const normalized = normalizeRoutes(routes);
    assert.equal(normalized.error, null);
    assert.deepStrictEqual(normalized.routes, routes);
  });

  test('normalizes src', () => {
    const expected = '^/about$';
    const expected2 = '^\\/about$';
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
      normalized.routes.forEach((route) => {
        if (isHandler(route)) {
          assert.fail(
            `Normalizer returned: { handle: ${
              route.handle
            } } instead of { src: ${expected} }`,
          );
        } else {
          assert.ok(route.src === expected || route.src === expected2);
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

  test('fails with abnormal routes', () => {
    const errors = [];
    const routes = [];

    routes.push({ handle: 'doesnotexist' });
    errors.push({
      message: 'This is not a valid handler (handle: doesnotexist)',
      handle: 'doesnotexist',
    });

    // @ts-ignore
    routes.push({ handle: 'filesystem', illegal: true });
    errors.push({
      message:
        'Cannot have any other keys when handle is used (handle: filesystem)',
      handle: 'filesystem',
    });

    routes.push({ handle: 'filesystem' });
    errors.push({
      message: 'You can only handle something once (handle: filesystem)',
      handle: 'filesystem',
    });

    routes.push({ src: '^/(broken]$' });
    errors.push({
      message: 'Invalid regular expression: "^/(broken]$"',
      src: '^/(broken]$',
    });

    // @ts-ignore
    routes.push({ doesNotExist: true });
    errors.push({
      message: 'A route must set either handle or src',
    });

    // @ts-ignore
    routes.push({ src: '^/about$', doesNotExist: true });

    const normalized = normalizeRoutes(routes);

    assert.deepStrictEqual(normalized.routes, routes);
    assert.deepStrictEqual(normalized.error, {
      code: 'invalid_routes',
      message: `One or more invalid routes were found: \n${JSON.stringify(
        errors,
        null,
        2,
      )}`,
      errors,
    });
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
          dataPath: '[0].src',
          keyword: 'type',
          message: 'should be string',
          params: {
            type: 'string',
          },
          schemaPath: '#/items/properties/src/type',
        },
      ],
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
          dataPath: '[0].dest',
          keyword: 'type',
          message: 'should be string',
          params: {
            type: 'string',
          },
          schemaPath: '#/items/properties/dest/type',
        },
      ],
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
          dataPath: '[0].methods',
          keyword: 'type',
          message: 'should be array',
          params: {
            type: 'array',
          },
          schemaPath: '#/items/properties/methods/type',
        },
      ],
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
          dataPath: '[0].methods[0]',
          keyword: 'type',
          message: 'should be string',
          params: {
            type: 'string',
          },
          schemaPath: '#/items/properties/methods/items/type',
        },
      ],
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
          dataPath: '[0].headers',
          keyword: 'type',
          message: 'should be object',
          params: {
            type: 'object',
          },
          schemaPath: '#/items/properties/headers/type',
        },
      ],
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
          dataPath: "[0].headers['test']",
          keyword: 'type',
          message: 'should be string',
          params: {
            type: 'string',
          },
          schemaPath:
            '#/items/properties/headers/patternProperties/%5E.%7B1%2C256%7D%24/type',
        },
      ],
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
          dataPath: '[0].handle',
          keyword: 'type',
          message: 'should be string',
          params: {
            type: 'string',
          },
          schemaPath: '#/items/properties/handle/type',
        },
      ],
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
          dataPath: '[0].continue',
          keyword: 'type',
          message: 'should be boolean',
          params: {
            type: 'boolean',
          },
          schemaPath: '#/items/properties/continue/type',
        },
      ],
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
          dataPath: '[0].status',
          keyword: 'type',
          message: 'should be integer',
          params: {
            type: 'integer',
          },
          schemaPath: '#/items/properties/status/type',
        },
      ],
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
          dataPath: '[0]',
          keyword: 'additionalProperties',
          message: 'should NOT have additional properties',
          params: {
            additionalProperty: 'doesNotExist',
          },
          schemaPath: '#/items/additionalProperties',
        },
      ],
    );
  });
});
