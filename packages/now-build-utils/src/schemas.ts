/**
 * Ajv schema for the functions property
 */
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
        runtime: {
          type: 'string',
          maxLength: 256,
        },
        memory: {
          type: 'number',
          minimum: 128,
          maximum: 3008,
        },
        maxDuration: {
          type: 'number',
          minimum: 1,
          maximum: 900,
        },
        includeFiles: {
          type: 'string',
          maxLength: 256,
        },
        excludeFiles: {
          type: 'string',
          maxLength: 256,
        },
      },
    },
  },
};
