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
