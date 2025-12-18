const mitigateSchema = {
  description: 'Mitigation action to take on a route',
  type: 'object',
  additionalProperties: false,
  required: ['action'],
  properties: {
    action: {
      description: 'The mitigation action to take',
      type: 'string',
      enum: ['challenge', 'deny'],
    },
  },
} as const;

const matchableValueSchema = {
  description:
    'A value to match against. Can be a string (regex) or a condition operation object',
  anyOf: [
    {
      description:
        'A regular expression used to match thev value. Named groups can be used in the destination.',
      type: 'string',
      maxLength: 4096,
    },
    {
      description: 'A condition operation object',
      type: 'object',
      additionalProperties: false,
      minProperties: 1,
      properties: {
        eq: {
          description: 'Equal to',
          anyOf: [
            {
              type: 'string',
              maxLength: 4096,
            },
            {
              type: 'number',
            },
          ],
        },
        neq: {
          description: 'Not equal',
          type: 'string',
          maxLength: 4096,
        },
        inc: {
          description: 'In array',
          type: 'array',
          items: {
            type: 'string',
            maxLength: 4096,
          },
        },
        ninc: {
          description: 'Not in array',
          type: 'array',
          items: {
            type: 'string',
            maxLength: 4096,
          },
        },
        pre: {
          description: 'Starts with',
          type: 'string',
          maxLength: 4096,
        },
        suf: {
          description: 'Ends with',
          type: 'string',
          maxLength: 4096,
        },
        re: {
          description: 'Regex',
          type: 'string',
          maxLength: 4096,
        },
        gt: {
          description: 'Greater than',
          type: 'number',
        },
        gte: {
          description: 'Greater than or equal to',
          type: 'number',
        },
        lt: {
          description: 'Less than',
          type: 'number',
        },
        lte: {
          description: 'Less than or equal to',
          type: 'number',
        },
      },
    },
  ],
} as const;

export const hasSchema = {
  description: 'An array of requirements that are needed to match',
  type: 'array',
  maxItems: 16,
  items: {
    anyOf: [
      {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'value'],
        properties: {
          type: {
            description: 'The type of request element to check',
            type: 'string',
            enum: ['host'],
          },
          value: matchableValueSchema,
        },
      },
      {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'key'],
        properties: {
          type: {
            description: 'The type of request element to check',
            type: 'string',
            enum: ['header', 'cookie', 'query'],
          },
          key: {
            description:
              'The name of the element contained in the particular type',
            type: 'string',
            maxLength: 4096,
          },
          value: matchableValueSchema,
        },
      },
    ],
  },
} as const;

const transformsSchema = {
  description:
    'A list of transform rules to adjust the query parameters of a request or HTTP headers of request or response',
  type: 'array',
  minItems: 1,
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['type', 'op', 'target'],
    properties: {
      type: {
        description: 'The scope of the transform to apply',
        type: 'string',
        enum: ['request.headers', 'request.query', 'response.headers'],
      },
      op: {
        description: 'The operation to perform on the target',
        type: 'string',
        enum: ['append', 'set', 'delete'],
      },
      target: {
        description: 'The target of the transform',
        type: 'object',
        required: ['key'],
        properties: {
          // re is not supported for transforms. Once supported, replace target.key with matchableValueSchema
          key: {
            description:
              'A value to match against. Can be a string or a condition operation object (without regex support)',
            anyOf: [
              {
                description:
                  'A valid header name (letters, numbers, hyphens, underscores)',
                type: 'string',
                maxLength: 4096,
              },
              {
                description: 'A condition operation object',
                type: 'object',
                additionalProperties: false,
                minProperties: 1,
                properties: {
                  eq: {
                    description: 'Equal to',
                    anyOf: [
                      {
                        type: 'string',
                        maxLength: 4096,
                      },
                      {
                        type: 'number',
                      },
                    ],
                  },
                  neq: {
                    description: 'Not equal',
                    type: 'string',
                    maxLength: 4096,
                  },
                  inc: {
                    description: 'In array',
                    type: 'array',
                    items: {
                      type: 'string',
                      maxLength: 4096,
                    },
                  },
                  ninc: {
                    description: 'Not in array',
                    type: 'array',
                    items: {
                      type: 'string',
                      maxLength: 4096,
                    },
                  },
                  pre: {
                    description: 'Starts with',
                    type: 'string',
                    maxLength: 4096,
                  },
                  suf: {
                    description: 'Ends with',
                    type: 'string',
                    maxLength: 4096,
                  },
                  gt: {
                    description: 'Greater than',
                    type: 'number',
                  },
                  gte: {
                    description: 'Greater than or equal to',
                    type: 'number',
                  },
                  lt: {
                    description: 'Less than',
                    type: 'number',
                  },
                  lte: {
                    description: 'Less than or equal to',
                    type: 'number',
                  },
                },
              },
            ],
          },
        },
      },
      args: {
        description: 'The arguments to the operation',
        anyOf: [
          {
            type: 'string',
            maxLength: 4096,
          },
          {
            type: 'array',
            minItems: 1,
            items: {
              type: 'string',
              maxLength: 4096,
            },
          },
        ],
      },
      env: {
        description:
          'An array of environment variable names that should be replaced at runtime in the args value',
        type: 'array',
        minItems: 1,
        maxItems: 64,
        items: {
          type: 'string',
          maxLength: 256,
        },
      },
    },
    allOf: [
      {
        if: {
          properties: {
            op: {
              enum: ['append', 'set'],
            },
          },
        },
        then: {
          required: ['args'],
        },
      },
      {
        if: {
          allOf: [
            {
              properties: {
                type: {
                  enum: ['request.headers', 'response.headers'],
                },
              },
            },
            {
              properties: {
                op: {
                  enum: ['set', 'append'],
                },
              },
            },
          ],
        },
        then: {
          properties: {
            target: {
              properties: {
                key: {
                  if: {
                    type: 'string',
                  },
                  then: {
                    pattern: '^[a-zA-Z0-9_-]+$',
                  },
                },
              },
            },
            args: {
              anyOf: [
                {
                  type: 'string',
                  pattern:
                    '^[a-zA-Z0-9_ :;.,"\'?!(){}\\[\\]@<>=+*#$&`|~\\^%/-]+$',
                },
                {
                  type: 'array',
                  items: {
                    type: 'string',
                    pattern:
                      '^[a-zA-Z0-9_ :;.,"\'?!(){}\\[\\]@<>=+*#$&`|~\\^%/-]+$',
                  },
                },
              ],
            },
          },
        },
      },
    ],
  },
} as const;

/**
 * An ajv schema for the routes array
 */
export const routesSchema = {
  type: 'array',
  deprecated: true,
  description:
    'A list of routes objects used to rewrite paths to point towards other internal or external paths',
  example: [{ dest: 'https://docs.example.com', src: '/docs' }],
  items: {
    anyOf: [
      {
        type: 'object',
        required: ['src'],
        additionalProperties: false,
        properties: {
          src: {
            type: 'string',
            maxLength: 4096,
          },
          dest: {
            type: 'string',
            maxLength: 4096,
          },
          headers: {
            type: 'object',
            additionalProperties: false,
            minProperties: 1,
            maxProperties: 100,
            patternProperties: {
              '^.{1,256}$': {
                type: 'string',
                maxLength: 32768,
              },
            },
          },
          methods: {
            type: 'array',
            maxItems: 10,
            items: {
              type: 'string',
              maxLength: 32,
            },
          },
          caseSensitive: {
            type: 'boolean',
          },
          important: {
            type: 'boolean',
          },
          user: {
            type: 'boolean',
          },
          continue: {
            type: 'boolean',
          },
          override: {
            type: 'boolean',
          },
          check: {
            type: 'boolean',
          },
          isInternal: {
            type: 'boolean',
          },
          status: {
            type: 'integer',
            minimum: 100,
            maximum: 999,
          },
          locale: {
            type: 'object',
            additionalProperties: false,
            minProperties: 1,
            properties: {
              redirect: {
                type: 'object',
                additionalProperties: false,
                minProperties: 1,
                maxProperties: 100,
                patternProperties: {
                  '^.{1,256}$': {
                    type: 'string',
                    maxLength: 4096,
                  },
                },
              },
              value: {
                type: 'string',
                maxLength: 4096,
              },
              path: {
                type: 'string',
                maxLength: 4096,
              },
              cookie: {
                type: 'string',
                maxLength: 4096,
              },
              default: {
                type: 'string',
                maxLength: 4096,
              },
            },
          },
          middleware: { type: 'number' },
          middlewarePath: { type: 'string' },
          middlewareRawSrc: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
          has: hasSchema,
          missing: hasSchema,
          mitigate: mitigateSchema,
          transforms: transformsSchema,
          env: {
            description:
              'An array of environment variable names that should be replaced at runtime in the destination or headers',
            type: 'array',
            minItems: 1,
            maxItems: 64,
            items: {
              type: 'string',
              maxLength: 256,
            },
          },
        },
      },
      {
        type: 'object',
        required: ['handle'],
        additionalProperties: false,
        properties: {
          handle: {
            type: 'string',
            maxLength: 32,
            enum: ['error', 'filesystem', 'hit', 'miss', 'resource', 'rewrite'],
          },
        },
      },
    ],
  },
} as const;

export const rewritesSchema = {
  type: 'array',
  maxItems: 2048,
  description: 'A list of rewrite definitions.',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['source', 'destination'],
    properties: {
      source: {
        description:
          'A pattern that matches each incoming pathname (excluding querystring).',
        type: 'string',
        maxLength: 4096,
      },
      destination: {
        description:
          'An absolute pathname to an existing resource or an external URL.',
        type: 'string',
        maxLength: 4096,
      },
      has: hasSchema,
      missing: hasSchema,
      statusCode: {
        description:
          'An optional integer to override the status code of the response.',
        type: 'integer',
        minimum: 100,
        maximum: 999,
      },
      env: {
        description:
          'An array of environment variable names that should be replaced at runtime in the destination',
        type: 'array',
        minItems: 1,
        maxItems: 64,
        items: {
          type: 'string',
          maxLength: 256,
        },
      },
    },
  },
} as const;

export const redirectsSchema = {
  title: 'Redirects',
  type: 'array',
  maxItems: 2048,
  description: 'A list of redirect definitions.',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['source', 'destination'],
    properties: {
      source: {
        description:
          'A pattern that matches each incoming pathname (excluding querystring).',
        type: 'string',
        maxLength: 4096,
      },
      destination: {
        description:
          'A location destination defined as an absolute pathname or external URL.',
        type: 'string',
        maxLength: 4096,
      },
      permanent: {
        description:
          'A boolean to toggle between permanent and temporary redirect. When `true`, the status code is `308`. When `false` the status code is `307`.',
        type: 'boolean',
      },
      statusCode: {
        description:
          'An optional integer to define the status code of the redirect.',
        private: true,
        type: 'integer',
        minimum: 100,
        maximum: 999,
      },
      has: hasSchema,
      missing: hasSchema,
      env: {
        description:
          'An array of environment variable names that should be replaced at runtime in the destination',
        type: 'array',
        minItems: 1,
        maxItems: 64,
        items: {
          type: 'string',
          maxLength: 256,
        },
      },
    },
  },
} as const;

export const headersSchema = {
  type: 'array',
  maxItems: 2048,
  description: 'A list of header definitions.',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['source', 'headers'],
    properties: {
      source: {
        description:
          'A pattern that matches each incoming pathname (excluding querystring)',
        type: 'string',
        maxLength: 4096,
      },
      headers: {
        description:
          'An array of key/value pairs representing each response header.',
        type: 'array',
        maxItems: 1024,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['key', 'value'],
          properties: {
            key: {
              type: 'string',
              maxLength: 4096,
            },
            value: {
              type: 'string',
              maxLength: 32768,
            },
          },
        },
      },
      has: hasSchema,
      missing: hasSchema,
    },
  },
} as const;

export const cleanUrlsSchema = {
  description:
    'When set to `true`, all HTML files and Serverless Functions will have their extension removed. When visiting a path that ends with the extension, a 308 response will redirect the client to the extensionless path.',
  type: 'boolean',
} as const;

export const trailingSlashSchema = {
  description:
    'When `false`, visiting a path that ends with a forward slash will respond with a `308` status code and redirect to the path without the trailing slash.',
  type: 'boolean',
} as const;

export const bulkRedirectsSchema = {
  type: 'array',
  description: 'A list of bulk redirect definitions.',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['source', 'destination'],
    properties: {
      source: {
        description: 'The exact URL path or pattern to match.',
        type: 'string',
        maxLength: 2048,
      },
      destination: {
        description: 'The target URL path where traffic should be redirected.',
        type: 'string',
        maxLength: 2048,
      },
      permanent: {
        description:
          'A boolean to toggle between permanent and temporary redirect. When `true`, the status code is `308`. When `false` the status code is `307`.',
        type: 'boolean',
      },
      statusCode: {
        description:
          'An optional integer to define the status code of the redirect.',
        type: 'integer',
        enum: [301, 302, 307, 308],
      },
      sensitive: {
        description:
          'A boolean to toggle between case-sensitive and case-insensitive redirect. When `true`, the redirect is case-sensitive. When `false` the redirect is case-insensitive.',
        type: 'boolean',
      },
      query: {
        description:
          'Whether the query string should be preserved by the redirect. The default is `false`.',
        type: 'boolean',
      },
    },
  },
} as const;
