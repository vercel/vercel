/**
 * An ajv schema for the routes array
 */
export const routesSchema = {
  type: 'array',
  maxItems: 1024,
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
          important: {
            type: 'boolean',
          },
          continue: {
            type: 'boolean',
          },
          check: {
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
};

export const rewritesSchema = {
  type: 'array',
  maxItems: 1024,
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['source', 'destination'],
    properties: {
      source: {
        type: 'string',
        maxLength: 4096,
      },
      destination: {
        type: 'string',
        maxLength: 4096,
      },
    },
  },
};

export const redirectsSchema = {
  title: 'Redirects',
  type: 'array',
  maxItems: 1024,
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['source', 'destination'],
    properties: {
      source: {
        type: 'string',
        maxLength: 4096,
      },
      destination: {
        type: 'string',
        maxLength: 4096,
      },
      permanent: {
        type: 'boolean',
      },
      statusCode: {
        type: 'integer',
        minimum: 100,
        maximum: 999,
      },
    },
  },
};

export const headersSchema = {
  type: 'array',
  maxItems: 1024,
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['source', 'headers'],
    properties: {
      source: {
        type: 'string',
        maxLength: 4096,
      },
      headers: {
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
    },
  },
};

export const cleanUrlsSchema = {
  type: 'boolean',
};

export const trailingSlashSchema = {
  type: 'boolean',
};
