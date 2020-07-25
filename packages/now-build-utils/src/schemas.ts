export const string256Schema = {
  type: 'string',
  maxLength: 256,
};

export const functionsSchema = {
  type: 'object',
  minProperties: 1,
  maxProperties: 50,
  additionalProperties: false,
  patternProperties: {
    '^.{1,256}$': {
      type: 'object',
      additionalProperties: false,
      properties: {
        runtime: string256Schema,
        memory: {
          // Number between 128 and 3008 in steps of 64
          enum: Object.keys(Array.from({ length: 50 }))
            .slice(2, 48)
            .map(x => Number(x) * 64),
        },
        maxDuration: {
          type: 'number',
          minimum: 1,
          maximum: 900,
        },
        includeFiles: {
          oneOf: [
            string256Schema,
            {
              type: 'array',
              minItems: 1,
              maxItems: 50,
              items: string256Schema,
            },
          ],
        },
        excludeFiles: {
          oneOf: [
            string256Schema,
            {
              type: 'array',
              minItems: 1,
              maxItems: 50,
              items: string256Schema,
            },
          ],
        },
      },
    },
  },
};

export const buildsSchema = {
  type: 'array',
  minItems: 0,
  maxItems: 128,
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['use'],
    properties: {
      src: {
        type: 'string',
        minLength: 1,
        maxLength: 4096,
      },
      use: {
        type: 'string',
        minLength: 3,
        maxLength: 256,
      },
      config: { type: 'object' },
    },
  },
};
