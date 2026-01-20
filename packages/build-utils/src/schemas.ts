const triggerEventSchema = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      const: 'queue/v1beta',
    },
    topic: {
      type: 'string',
      minLength: 1,
    },
    consumer: {
      type: 'string',
      minLength: 1,
    },
    maxDeliveries: {
      type: 'number',
      minimum: 1,
    },
    retryAfterSeconds: {
      type: 'number',
      exclusiveMinimum: 0,
    },
    initialDelaySeconds: {
      type: 'number',
      minimum: 0,
    },
  },
  required: ['type', 'topic', 'consumer'],
  additionalProperties: false,
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
        architecture: {
          type: 'string',
          enum: ['x86_64', 'arm64'],
        },
        runtime: {
          type: 'string',
          maxLength: 256,
        },
        memory: {
          minimum: 128,
          maximum: 10240,
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
        experimentalTriggers: {
          type: 'array',
          items: triggerEventSchema,
        },
        supportsCancellation: {
          type: 'boolean',
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
