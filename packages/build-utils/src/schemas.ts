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

/**
 * Schema for a single service configuration.
 * @experimental This feature is experimental and may change.
 */
export const serviceSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    type: {
      description: 'Service type: web, cron, or worker. Defaults to web.',
      enum: ['web', 'cron', 'worker'],
    },
    entrypoint: {
      description:
        'Entry file for the service, relative to the workspace directory.',
      type: 'string',
      minLength: 1,
      maxLength: 512,
    },
    workspace: {
      description:
        'Path to the directory containing the service manifest file (package.json, pyproject.toml, etc.). Defaults to "." (project root).',
      type: 'string',
      minLength: 1,
      maxLength: 512,
    },
    routePrefix: {
      description: 'URL prefix for routing (web services only).',
      type: 'string',
      minLength: 1,
      maxLength: 512,
    },
    framework: {
      description: 'Framework to use.',
      type: 'string',
      minLength: 1,
      maxLength: 256,
    },
    builder: {
      description: 'Builder to use, e.g. @vercel/node, @vercel/python.',
      type: 'string',
      minLength: 1,
      maxLength: 256,
    },
    runtime: {
      description:
        'Specific lambda runtime to use, e.g. nodejs24.x, python3.14.',
      type: 'string',
      minLength: 1,
      maxLength: 256,
    },
    buildCommand: {
      description: 'Build command for the service.',
      type: 'string',
      minLength: 1,
      maxLength: 2048,
    },
    installCommand: {
      description: 'Install command for the service.',
      type: 'string',
      minLength: 1,
      maxLength: 2048,
    },
    memory: {
      description: 'Memory allocation in MB (128-10240).',
      type: 'integer',
      minimum: 128,
      maximum: 10240,
    },
    maxDuration: {
      description: 'Max duration in seconds (1-900).',
      type: 'integer',
      minimum: 1,
      maximum: 900,
    },
    includeFiles: {
      description: 'Files to include in bundle.',
      oneOf: [
        { type: 'string', minLength: 1 },
        { type: 'array', items: { type: 'string', minLength: 1 } },
      ],
    },
    excludeFiles: {
      description: 'Files to exclude from bundle.',
      oneOf: [
        { type: 'string', minLength: 1 },
        { type: 'array', items: { type: 'string', minLength: 1 } },
      ],
    },
    schedule: {
      description:
        'Cron schedule expression (e.g., "0 0 * * *"). Required for cron services.',
      type: 'string',
      minLength: 9,
      maxLength: 256,
    },
    topic: {
      description: 'Topic name for worker subscription.',
      type: 'string',
      minLength: 1,
      maxLength: 256,
    },
    consumer: {
      description: 'Consumer group name for worker subscription.',
      type: 'string',
      minLength: 1,
      maxLength: 256,
    },
  },
} as const;

/**
 * Schema for experimentalServices - a map of service name to service configuration.
 * @experimental This feature is experimental and may change.
 */
export const servicesSchema = {
  type: 'object',
  additionalProperties: serviceSchema,
} as const;

/**
 * Schema for experimentalServiceGroups - a map of group name to service group configuration.
 * @experimental This feature is experimental and may change.
 */
export const serviceGroupsSchema = {
  type: 'object',
  additionalProperties: {
    type: 'object',
    additionalProperties: false,
    required: ['services'],
    properties: {
      services: {
        description:
          'Map of service name to service configuration within this group.',
        type: 'object',
        additionalProperties: serviceSchema,
      },
    },
  },
} as const;
