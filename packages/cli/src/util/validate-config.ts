import Ajv from 'ajv';
import {
  routesSchema,
  cleanUrlsSchema,
  headersSchema,
  redirectsSchema,
  rewritesSchema,
  trailingSlashSchema,
} from '@vercel/routing-utils';
import type { VercelConfig } from './dev/types';
import {
  functionsSchema,
  buildsSchema,
  NowBuildError,
  getPrettyError,
} from '@vercel/build-utils';
import { fileNameSymbol } from '@vercel/client';

const imagesSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['sizes'],
  properties: {
    contentDispositionType: {
      enum: ['inline', 'attachment'],
    },
    contentSecurityPolicy: {
      type: 'string',
      minLength: 1,
      maxLength: 256,
    },
    dangerouslyAllowSVG: {
      type: 'boolean',
    },
    domains: {
      type: 'array',
      minItems: 0,
      maxItems: 50,
      items: {
        type: 'string',
        minLength: 1,
        maxLength: 256,
      },
    },
    formats: {
      type: 'array',
      minItems: 1,
      maxItems: 4,
      items: {
        enum: ['image/avif', 'image/webp', 'image/jpeg', 'image/png'],
      },
    },
    localPatterns: {
      type: 'array',
      minItems: 0,
      maxItems: 25,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          pathname: {
            type: 'string',
            minLength: 1,
            maxLength: 256,
          },
          search: {
            type: 'string',
            minLength: 0,
            maxLength: 256,
          },
        },
      },
    },
    minimumCacheTTL: {
      type: 'integer',
      minimum: 1,
      maximum: 315360000,
    },
    qualities: {
      type: 'array',
      minItems: 1,
      maxItems: 20,
      items: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
      },
    },
    remotePatterns: {
      type: 'array',
      minItems: 0,
      maxItems: 50,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['hostname'],
        properties: {
          protocol: {
            enum: ['http', 'https'],
          },
          hostname: {
            type: 'string',
            minLength: 1,
            maxLength: 256,
          },
          port: {
            type: 'string',
            minLength: 0,
            maxLength: 5,
          },
          pathname: {
            type: 'string',
            minLength: 1,
            maxLength: 256,
          },
          search: {
            type: 'string',
            minLength: 0,
            maxLength: 256,
          },
        },
      },
    },
    sizes: {
      type: 'array',
      minItems: 1,
      maxItems: 50,
      items: {
        type: 'number',
      },
    },
  },
};

const cronsSchema = {
  type: 'array',
  minItems: 0,
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['path', 'schedule'],
    properties: {
      path: {
        type: 'string',
        minLength: 1,
        maxLength: 512,
        pattern: '^/.*',
      },
      schedule: {
        type: 'string',
        minLength: 9,
        maxLength: 256,
      },
    },
  },
};

const experimentalServicesMountSchema = {
  oneOf: [
    {
      type: 'string',
      minLength: 1,
      maxLength: 512,
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: {
          type: 'string',
          minLength: 1,
          maxLength: 512,
        },
        subdomain: {
          type: 'string',
          minLength: 1,
          maxLength: 63,
        },
      },
      anyOf: [{ required: ['path'] }, { required: ['subdomain'] }],
    },
  ],
};

const servicesMountSchema = {
  oneOf: [
    {
      type: 'string',
      minLength: 1,
      maxLength: 512,
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['path'],
      properties: {
        path: {
          type: 'string',
          minLength: 1,
          maxLength: 512,
        },
      },
    },
  ],
};

const experimentalServicesRoutingSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['paths'],
  properties: {
    flag: {
      type: 'string',
      minLength: 1,
      maxLength: 256,
    },
    paths: {
      type: 'array',
      minItems: 1,
      maxItems: 100,
      items: {
        type: 'string',
        minLength: 1,
        maxLength: 512,
      },
    },
  },
};

const serviceScheduleSchema = {
  oneOf: [
    {
      type: 'string',
      minLength: 9,
      maxLength: 256,
    },
    {
      type: 'array',
      minItems: 1,
      items: {
        type: 'string',
        minLength: 9,
        maxLength: 256,
      },
    },
  ],
};

const serviceQueueTopicSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['topic'],
  properties: {
    topic: {
      type: 'string',
      minLength: 1,
      maxLength: 256,
    },
    retryAfterSeconds: {
      type: 'integer',
      minimum: 1,
      maximum: 86400,
    },
    initialDelaySeconds: {
      type: 'integer',
      minimum: 0,
      maximum: 86400,
    },
  },
};

const serviceTopicsSchema = {
  oneOf: [
    {
      type: 'array',
      minItems: 1,
      items: {
        type: 'string',
        minLength: 1,
        maxLength: 256,
      },
    },
    {
      type: 'array',
      minItems: 1,
      items: serviceQueueTopicSchema,
    },
  ],
};

const experimentalServicesCommonProperties = {
  entrypoint: {
    type: 'string',
    minLength: 1,
    maxLength: 512,
  },
  command: {
    type: 'string',
    minLength: 1,
    maxLength: 2048,
  },
  root: {
    type: 'string',
    minLength: 1,
    maxLength: 512,
  },
  workspace: {
    type: 'string',
    minLength: 1,
    maxLength: 512,
  },
  framework: {
    type: 'string',
    minLength: 1,
    maxLength: 256,
  },
  builder: {
    type: 'string',
    minLength: 1,
    maxLength: 256,
  },
  runtime: {
    type: 'string',
    minLength: 1,
    maxLength: 256,
  },
  buildCommand: {
    type: 'string',
    minLength: 1,
    maxLength: 2048,
  },
  installCommand: {
    type: 'string',
    minLength: 1,
    maxLength: 2048,
  },
  preDeployCommand: {
    type: 'string',
    minLength: 1,
    maxLength: 2048,
  },
  memory: {
    type: 'integer',
    minimum: 128,
    maximum: 10240,
  },
  maxDuration: {
    oneOf: [
      { type: 'integer', minimum: 1, maximum: 900 },
      { type: 'string', enum: ['max'] },
    ],
  },
  includeFiles: {
    oneOf: [
      { type: 'string', minLength: 1 },
      {
        type: 'array',
        items: { type: 'string', minLength: 1 },
      },
    ],
  },
  excludeFiles: {
    oneOf: [
      { type: 'string', minLength: 1 },
      {
        type: 'array',
        items: { type: 'string', minLength: 1 },
      },
    ],
  },
};

const experimentalServicesRoutableProperties = {
  mount: experimentalServicesMountSchema,
  routing: experimentalServicesRoutingSchema,
  routePrefix: {
    type: 'string',
    minLength: 1,
    maxLength: 512,
  },
  subdomain: {
    type: 'string',
    minLength: 1,
    maxLength: 63,
  },
};

const servicesCommonProperties = {
  entrypoint: experimentalServicesCommonProperties.entrypoint,
  command: experimentalServicesCommonProperties.command,
  root: experimentalServicesCommonProperties.root,
  framework: experimentalServicesCommonProperties.framework,
  runtime: experimentalServicesCommonProperties.runtime,
  buildCommand: experimentalServicesCommonProperties.buildCommand,
  preDeployCommand: experimentalServicesCommonProperties.preDeployCommand,
  memory: experimentalServicesCommonProperties.memory,
  maxDuration: experimentalServicesCommonProperties.maxDuration,
  includeFiles: experimentalServicesCommonProperties.includeFiles,
  excludeFiles: experimentalServicesCommonProperties.excludeFiles,
};

const servicesRoutableProperties = {
  mount: servicesMountSchema,
};

const experimentalServicesServiceConfigSchema = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...experimentalServicesCommonProperties,
        ...experimentalServicesRoutableProperties,
        type: {
          enum: ['web'],
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'trigger', 'schedule'],
      properties: {
        ...experimentalServicesCommonProperties,
        type: {
          const: 'job',
        },
        trigger: {
          const: 'schedule',
        },
        schedule: serviceScheduleSchema,
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'trigger', 'topics'],
      properties: {
        ...experimentalServicesCommonProperties,
        type: {
          const: 'job',
        },
        trigger: {
          const: 'queue',
        },
        topics: serviceTopicsSchema,
        consumer: {
          type: 'string',
          minLength: 1,
          maxLength: 256,
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'trigger', 'entrypoint'],
      properties: {
        ...experimentalServicesCommonProperties,
        type: {
          const: 'job',
        },
        trigger: {
          const: 'workflow',
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['type'],
      properties: {
        ...experimentalServicesCommonProperties,
        type: {
          const: 'worker',
        },
        topics: {
          type: 'array',
          items: {
            type: 'string',
            minLength: 1,
            maxLength: 256,
          },
          minItems: 1,
        },
        consumer: {
          type: 'string',
          minLength: 1,
          maxLength: 256,
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'schedule'],
      properties: {
        ...experimentalServicesCommonProperties,
        type: {
          const: 'cron',
        },
        schedule: serviceScheduleSchema,
      },
    },
  ],
};

const servicesServiceConfigSchema = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...servicesCommonProperties,
        ...servicesRoutableProperties,
        type: {
          enum: ['web'],
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'trigger'],
      properties: {
        ...servicesCommonProperties,
        type: {
          const: 'job',
        },
        trigger: {
          const: 'schedule',
        },
        schedule: serviceScheduleSchema,
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'trigger'],
      properties: {
        ...servicesCommonProperties,
        type: {
          const: 'job',
        },
        trigger: {
          const: 'queue',
        },
        topics: serviceTopicsSchema,
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'trigger', 'entrypoint'],
      properties: {
        ...servicesCommonProperties,
        type: {
          const: 'job',
        },
        trigger: {
          const: 'workflow',
        },
      },
    },
  ],
};

const servicesSchema = {
  type: 'object',
  propertyNames: {
    pattern: '^[a-zA-Z]([a-zA-Z0-9_-]*[a-zA-Z0-9])?$',
    maxLength: 64,
  },
  additionalProperties: servicesServiceConfigSchema,
};

/**
 * Schema for experimental services configuration.
 * Map of service name to service configuration.
 * @experimental This feature is experimental and may change.
 */
const experimentalServicesSchema = {
  type: 'object',
  propertyNames: {
    pattern: '^[a-zA-Z]([a-zA-Z0-9_-]*[a-zA-Z0-9])?$',
    maxLength: 64,
  },
  additionalProperties: experimentalServicesServiceConfigSchema,
};

/**
 * Schema for experimental service groups configuration.
 * Map of group name to array of service names belonging to that group.
 * @experimental This feature is experimental and may change.
 * @example { "app": ["site", "backend"], "admin": ["admin", "backend"] }
 */
const experimentalServiceGroupsSchema = {
  type: 'object',
  propertyNames: {
    pattern: '^[a-zA-Z]([a-zA-Z0-9_-]*[a-zA-Z0-9])?$',
    maxLength: 64,
  },
  additionalProperties: {
    type: 'array',
    items: {
      type: 'string',
      minLength: 1,
      maxLength: 256,
    },
  },
};

const vercelConfigSchema = {
  type: 'object',
  // These are not all possibilities because `vc dev`
  // doesn't need to know about `regions`, `public`, etc.
  additionalProperties: true,
  properties: {
    builds: buildsSchema,
    routes: routesSchema,
    cleanUrls: cleanUrlsSchema,
    headers: headersSchema,
    redirects: redirectsSchema,
    rewrites: rewritesSchema,
    trailingSlash: trailingSlashSchema,
    functions: functionsSchema,
    images: imagesSchema,
    crons: cronsSchema,
    bunVersion: { type: 'string' },
    services: servicesSchema,
    experimentalServices: experimentalServicesSchema,
    experimentalServiceGroups: experimentalServiceGroupsSchema,
  },
};

const ajv = new Ajv();
const validate = ajv.compile(vercelConfigSchema);

export function validateConfig(config: VercelConfig): NowBuildError | null {
  if (!validate(config)) {
    if (validate.errors && validate.errors[0]) {
      const error = validate.errors[0];
      const fileName = config[fileNameSymbol] || 'vercel.json';
      const niceError = getPrettyError(error);
      niceError.message = `Invalid ${fileName} - ${niceError.message}`;
      return niceError;
    }
  }

  if (config.functions && config.builds) {
    return new NowBuildError({
      code: 'FUNCTIONS_AND_BUILDS',
      message:
        'The `functions` property cannot be used in conjunction with the `builds` property. Please remove one of them.',
      link: 'https://vercel.link/functions-and-builds',
    });
  }

  const hasServices = Boolean(config.services);
  const hasExperimentalServices = Boolean(config.experimentalServices);

  if (hasServices && hasExperimentalServices) {
    return new NowBuildError({
      code: 'SERVICES_AND_EXPERIMENTAL_SERVICES',
      message:
        'The `services` property cannot be used in conjunction with the `experimentalServices` property. Please remove one of them.',
    });
  }

  if ((hasServices || hasExperimentalServices) && config.builds) {
    return new NowBuildError({
      code: 'SERVICES_AND_BUILDS',
      message:
        'The `services` property cannot be used in conjunction with the `builds` property. Please remove one of them.',
    });
  }

  if ((hasServices || hasExperimentalServices) && config.functions) {
    return new NowBuildError({
      code: 'SERVICES_AND_FUNCTIONS',
      message:
        'The `services` property cannot be used in conjunction with the `functions` property. Please remove one of them.',
    });
  }

  if (config.experimentalServiceGroups && !config.experimentalServices) {
    return new NowBuildError({
      code: 'SERVICE_GROUPS_WITHOUT_SERVICES',
      message:
        'The `experimentalServiceGroups` property requires `experimentalServices` to be defined. Service groups reference services by name.',
    });
  }

  return null;
}
