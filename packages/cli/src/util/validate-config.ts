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

const customErrorPageSchema = {
  oneOf: [
    { type: 'string', minLength: 1 },
    {
      type: 'object',
      additionalProperties: false,
      minProperties: 1,
      properties: {
        default5xx: {
          type: 'string',
          minLength: 1,
        },
        default4xx: {
          type: 'string',
          minLength: 1,
        },
      },
    },
  ],
};

const serviceConfigSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    type: {
      enum: ['web', 'cron', 'worker'],
    },
    entrypoint: {
      type: 'string',
      minLength: 1,
      maxLength: 512,
    },
    workspace: {
      type: 'string',
      minLength: 1,
      maxLength: 512,
    },
    routePrefix: {
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
    memory: {
      type: 'integer',
      minimum: 128,
      maximum: 10240,
    },
    maxDuration: {
      type: 'integer',
      minimum: 1,
      maximum: 900,
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
    // Cron-specific
    schedule: {
      type: 'string',
      minLength: 9,
      maxLength: 256,
    },
    // Worker-specific
    topic: {
      type: 'string',
      minLength: 1,
      maxLength: 256,
    },
    consumer: {
      type: 'string',
      minLength: 1,
      maxLength: 256,
    },
  },
};

/**
 * Schema for experimental services configuration.
 * Map of service name to service configuration.
 * @experimental This feature is experimental and may change.
 */
const experimentalServicesSchema = {
  type: 'object',
  additionalProperties: serviceConfigSchema,
};

/**
 * Schema for a single service group.
 * @experimental This feature is experimental and may change.
 */
const serviceGroupSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['services'],
  properties: {
    services: experimentalServicesSchema,
  },
};

/**
 * Schema for experimental service groups configuration.
 * Map of group name to service group configuration.
 * @experimental This feature is experimental and may change.
 */
const experimentalServiceGroupsSchema = {
  type: 'object',
  additionalProperties: serviceGroupSchema,
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
    customErrorPage: customErrorPageSchema,
    bunVersion: { type: 'string' },
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

  if (config.experimentalServices && config.builds) {
    return new NowBuildError({
      code: 'SERVICES_AND_BUILDS',
      message:
        'The `experimentalServices` property cannot be used in conjunction with the `builds` property. Please remove one of them.',
    });
  }

  if (config.experimentalServices && config.functions) {
    return new NowBuildError({
      code: 'SERVICES_AND_FUNCTIONS',
      message:
        'The `experimentalServices` property cannot be used in conjunction with the `functions` property. Please remove one of them.',
    });
  }

  if (config.experimentalServices && config.experimentalServiceGroups) {
    return new NowBuildError({
      code: 'SERVICES_AND_SERVICE_GROUPS',
      message:
        'The `experimentalServices` property cannot be used in conjunction with the `experimentalServiceGroups` property. Please remove one of them.',
    });
  }

  if (config.experimentalServiceGroups && config.builds) {
    return new NowBuildError({
      code: 'SERVICE_GROUPS_AND_BUILDS',
      message:
        'The `experimentalServiceGroups` property cannot be used in conjunction with the `builds` property. Please remove one of them.',
    });
  }

  if (config.experimentalServiceGroups && config.functions) {
    return new NowBuildError({
      code: 'SERVICE_GROUPS_AND_FUNCTIONS',
      message:
        'The `experimentalServiceGroups` property cannot be used in conjunction with the `functions` property. Please remove one of them.',
    });
  }

  return null;
}
