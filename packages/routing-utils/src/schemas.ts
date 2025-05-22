const conditionValueSchema = {
  anyOf: [
    {
      description:
        'A string value for backward compatibility (treated as regex)',
      type: 'string',
      maxLength: 4096,
    },
    {
      description: 'A condition operation object',
      type: 'object',
      additionalProperties: false,
      minProperties: 1,
      maxProperties: 1,
      properties: {
        eq: {
          description: 'Equal',
          anyOf: [{ type: 'string', maxLength: 4096 }, { type: 'number' }],
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
          maxItems: 100,
        },
        ninc: {
          description: 'Not in array',
          type: 'array',
          items: {
            type: 'string',
            maxLength: 4096,
          },
          maxItems: 100,
        },
        pre: {
          description: 'Has prefix',
          type: 'string',
          maxLength: 4096,
        },
        suf: {
          description: 'Has suffix',
          type: 'string',
          maxLength: 4096,
        },
        re: {
          description: 'Match regex pattern',
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

const mitigateSchema = {
  description: 'Mitigation action configuration',
  type: 'object',
  additionalProperties: false,
  required: ['action'],
  properties: {
    action: {
      description: 'The mitigation action to take',
      type: 'string',
      enum: ['log', 'challenge', 'deny', 'bypass', 'rate_limit', 'redirect'],
    },
    rateLimit: {
      description: 'Rate limiting configuration',
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['algo', 'window', 'limit', 'keys'],
          properties: {
            algo: {
              description: 'Rate limiting algorithm',
              type: 'string',
              enum: ['fixed_window', 'token_bucket'],
            },
            window: {
              description: 'Time window in seconds',
              type: 'number',
              minimum: 1,
            },
            limit: {
              description: 'Request limit within the window',
              type: 'number',
              minimum: 1,
            },
            keys: {
              description: 'Keys to group rate limiting by',
              type: 'array',
              items: {
                type: 'string',
                maxLength: 256,
              },
              maxItems: 10,
              minItems: 1,
            },
            action: {
              description: 'Action to take when rate limit is exceeded',
              anyOf: [
                { type: 'null' },
                {
                  type: 'string',
                  enum: ['log', 'challenge', 'deny', 'rate_limit'],
                },
              ],
            },
          },
        },
      ],
    },
    redirect: {
      description: 'Redirect configuration',
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['location', 'permanent'],
          properties: {
            location: {
              description: 'Redirect destination URL',
              type: 'string',
              maxLength: 4096,
            },
            permanent: {
              description: 'Whether the redirect is permanent',
              type: 'boolean',
            },
          },
        },
      ],
    },
    actionDuration: {
      description: 'Duration for the mitigation action',
      anyOf: [
        { type: 'null' },
        {
          type: 'string',
          maxLength: 256,
        },
      ],
    },
    bypassSystem: {
      description: 'Whether to bypass the system mitigation',
      anyOf: [{ type: 'null' }, { type: 'boolean' }],
    },
  },
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
          value: {
            description:
              'A value to match against the request element. Can be a string (treated as regex) or a condition operation object',
            ...conditionValueSchema,
          },
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
          value: {
            description:
              'A value to match against the request element. Can be a string (treated as regex) or a condition operation object',
            ...conditionValueSchema,
          },
        },
      },
    ],
  },
} as const;

/**
 * An ajv schema for the routes array
 */
const routeBaseProperties = {
  src: {
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
        maxLength: 4096,
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
} as const;

export const routesSchema = {
  type: 'array',
  maxItems: 2048,
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
          ...routeBaseProperties,
          dest: {
            type: 'string',
            maxLength: 4096,
          },
        },
      },
      {
        type: 'object',
        required: ['src', 'mitigate'],
        additionalProperties: false,
        properties: {
          ...routeBaseProperties,
          mitigate: mitigateSchema,
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
              maxLength: 4096,
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
