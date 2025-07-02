const cloudEventTriggerSchema = {
  type: 'object',
  properties: {
    triggerVersion: {
      type: 'number',
      const: 1,
    },
    specversion: {
      type: 'string',
      const: '1.0',
    },
    type: {
      type: 'string',
      minLength: 1,
    },
    httpBinding: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          const: 'structured',
        },
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'HEAD'],
        },
        pathname: {
          type: 'string',
          minLength: 1,
          pattern: '^/',
        },
      },
      required: ['mode'],
      additionalProperties: false,
    },
    queue: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          minLength: 1,
        },
        consumer: {
          type: 'string',
          minLength: 1,
        },
        maxAttempts: {
          type: 'number',
          minimum: 0,
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
      required: ['topic', 'consumer'],
      additionalProperties: false,
    },
  },
  required: ['triggerVersion', 'specversion', 'type', 'httpBinding'],
  additionalProperties: false,
  if: {
    properties: {
      type: { const: 'com.vercel.queue.v1' },
    },
  },
  then: {
    required: ['triggerVersion', 'specversion', 'type', 'httpBinding', 'queue'],
  },
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
          items: cloudEventTriggerSchema,
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
