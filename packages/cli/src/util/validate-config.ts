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
  getFunctionsSchema,
  buildsSchema,
  getMaxDurationLimit,
  getMaxDurationSchema,
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

const staticExperimentalServiceScheduleSchema = {
  type: 'string',
  minLength: 9,
  maxLength: 256,
  not: { const: '<dynamic>' },
};

const experimentalServiceScheduleSchema = {
  oneOf: [
    {
      type: 'string',
      minLength: 9,
      maxLength: 256,
    },
    {
      type: 'array',
      minItems: 1,
      items: staticExperimentalServiceScheduleSchema,
    },
  ],
};

const experimentalServiceQueueTopicSchema = {
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

const experimentalServiceTopicsSchema = {
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
      items: experimentalServiceQueueTopicSchema,
    },
  ],
};

const envVarNamesSchema = {
  pattern: '^[A-Za-z_][A-Za-z0-9_]*$',
  maxLength: 256,
};

const getExperimentalServicesCommonProperties = () => ({
  entrypoint: {
    type: 'string',
    minLength: 1,
    maxLength: 512,
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
  command: {
    oneOf: [
      { type: 'string', minLength: 1, maxLength: 2048 },
      {
        type: 'array',
        minItems: 1,
        items: { type: 'string', minLength: 1, maxLength: 2048 },
      },
    ],
  },
  memory: {
    type: 'integer',
    minimum: 128,
    maximum: 10240,
  },
  maxDuration: getMaxDurationSchema(),
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
});

const experimentalServicesRoutableProperties = {
  mount: experimentalServicesMountSchema,
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

const getExperimentalServicesServiceConfigSchema = () => ({
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...getExperimentalServicesCommonProperties(),
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
        ...getExperimentalServicesCommonProperties(),
        type: {
          const: 'job',
        },
        trigger: {
          const: 'schedule',
        },
        schedule: experimentalServiceScheduleSchema,
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'trigger', 'topics'],
      properties: {
        ...getExperimentalServicesCommonProperties(),
        type: {
          const: 'job',
        },
        trigger: {
          const: 'queue',
        },
        topics: experimentalServiceTopicsSchema,
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
        ...getExperimentalServicesCommonProperties(),
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
        ...getExperimentalServicesCommonProperties(),
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
        ...getExperimentalServicesCommonProperties(),
        type: {
          const: 'cron',
        },
        schedule: experimentalServiceScheduleSchema,
      },
    },
  ],
});

/**
 * Schema for experimental services configuration.
 * Map of service name to service configuration.
 * @experimental This feature is experimental and may change.
 */
const getExperimentalServicesSchema = () => ({
  type: 'object',
  propertyNames: {
    pattern: '^[a-zA-Z]([a-zA-Z0-9_-]*[a-zA-Z0-9])?$',
    maxLength: 64,
  },
  additionalProperties: getExperimentalServicesServiceConfigSchema(),
});

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

const experimentalServicesV2PathSchema = {
  type: 'string',
  minLength: 1,
  maxLength: 512,
};

const experimentalServicesV2CommandSchema = {
  type: 'string',
  minLength: 1,
  maxLength: 2048,
};

const experimentalServicesV2BindingSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'service', 'format', 'env'],
  properties: {
    type: { const: 'service' },
    service: {
      type: 'string',
      minLength: 1,
      maxLength: 64,
      pattern: '^[a-zA-Z]([a-zA-Z0-9_-]*[a-zA-Z0-9])?$',
    },
    format: { const: 'url' },
    env: {
      type: 'string',
      ...envVarNamesSchema,
    },
  },
};

const experimentalServicesV2BindingsSchema = {
  type: 'array',
  maxItems: 100,
  items: experimentalServicesV2BindingSchema,
};

const getExperimentalServicesV2ServiceConfigSchema = () => ({
  type: 'object',
  additionalProperties: false,
  required: ['root'],
  properties: {
    root: experimentalServicesV2PathSchema,
    framework: {
      type: 'string',
      minLength: 1,
      maxLength: 256,
    },
    runtime: {
      type: 'string',
      minLength: 1,
      maxLength: 256,
    },
    entrypoint: experimentalServicesV2PathSchema,
    installCommand: experimentalServicesV2CommandSchema,
    buildCommand: experimentalServicesV2CommandSchema,
    devCommand: experimentalServicesV2CommandSchema,
    ignoreCommand: experimentalServicesV2CommandSchema,
    outputDirectory: experimentalServicesV2PathSchema,
    bindings: experimentalServicesV2BindingsSchema,
    functions: getFunctionsSchema(),
    headers: headersSchema,
    redirects: redirectsSchema,
    rewrites: rewritesSchema,
    routes: routesSchema,
    cleanUrls: cleanUrlsSchema,
    trailingSlash: trailingSlashSchema,
  },
});

const getExperimentalServicesV2Schema = () => ({
  type: 'object',
  propertyNames: {
    pattern: '^[a-zA-Z]([a-zA-Z0-9_-]*[a-zA-Z0-9])?$',
    maxLength: 64,
  },
  additionalProperties: getExperimentalServicesV2ServiceConfigSchema(),
});

function buildVercelConfigSchema() {
  return {
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
      functions: getFunctionsSchema(),
      images: imagesSchema,
      crons: cronsSchema,
      bunVersion: { type: 'string' },
      experimentalServices: getExperimentalServicesSchema(),
      experimentalServiceGroups: experimentalServiceGroupsSchema,
      experimentalServicesV2: getExperimentalServicesV2Schema(),
    },
  };
}

const ajv = new Ajv();

/**
 * The `maxDuration` upper bound is gated behind
 * `VERCEL_CLI_SKIP_MAX_DURATION_LIMIT` (see `getMaxDurationSchema`), which may be
 * set after this module is imported. Compiling the validator once at module load
 * would bake in whatever limit was active at import time and ignore the variable,
 * so instead we build and compile lazily, caching one validator per resolved
 * limit (bounded vs. skipped).
 *
 * TODO: This machinery exists only to honor the runtime
 * `VERCEL_CLI_SKIP_MAX_DURATION_LIMIT` toggle. Once the flag is fully rolled out
 * and the client-side bound is dropped (see `max-duration.ts` in
 * `@vercel/build-utils`), revert to a single statically compiled validator.
 */
const validatorCacheByLimit = new Map<
  number | 'skipped',
  ReturnType<typeof ajv.compile>
>();

function getConfigValidator() {
  const cacheKey = getMaxDurationLimit() ?? 'skipped';
  let validate = validatorCacheByLimit.get(cacheKey);
  if (!validate) {
    validate = ajv.compile(buildVercelConfigSchema());
    validatorCacheByLimit.set(cacheKey, validate);
  }
  return validate;
}

export function validateConfig(config: VercelConfig): NowBuildError | null {
  const validate = getConfigValidator();
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

  const hasExperimentalServices = Boolean(config.experimentalServices);

  if (hasExperimentalServices && config.builds) {
    return new NowBuildError({
      code: 'EXPERIMENTAL_SERVICES_AND_BUILDS',
      message:
        'The `experimentalServices` property cannot be used in conjunction with the `builds` property. Please remove one of them.',
    });
  }

  if (hasExperimentalServices && config.functions) {
    return new NowBuildError({
      code: 'EXPERIMENTAL_SERVICES_AND_FUNCTIONS',
      message:
        'The `experimentalServices` property cannot be used in conjunction with the `functions` property. Please remove one of them.',
    });
  }

  if (config.experimentalServiceGroups && !config.experimentalServices) {
    return new NowBuildError({
      code: 'SERVICE_GROUPS_WITHOUT_SERVICES',
      message:
        'The `experimentalServiceGroups` property requires `experimentalServices` to be defined. Service groups reference services by name.',
    });
  }

  const hasExperimentalServicesV2 = Boolean(config.experimentalServicesV2);

  if (hasExperimentalServicesV2 && hasExperimentalServices) {
    return new NowBuildError({
      code: 'EXPERIMENTAL_SERVICES_V2_AND_EXPERIMENTAL_SERVICES',
      message:
        'The `experimentalServicesV2` property cannot be used in conjunction with the `experimentalServices` property. Please use only one services configuration.',
    });
  }

  if (hasExperimentalServicesV2 && config.builds) {
    return new NowBuildError({
      code: 'EXPERIMENTAL_SERVICES_V2_AND_BUILDS',
      message:
        'The `experimentalServicesV2` property cannot be used in conjunction with the `builds` property. Please remove one of them.',
    });
  }

  // with `experimentalServicesV2` some fields could be present only in services declaration
  if (hasExperimentalServicesV2) {
    const ambiguousTopLevel: string[] = [];
    if (config.functions != null) {
      ambiguousTopLevel.push('functions');
    }
    if (config.installCommand != null) {
      ambiguousTopLevel.push('installCommand');
    }
    if (config.buildCommand != null) {
      ambiguousTopLevel.push('buildCommand');
    }
    if (config.devCommand != null) {
      ambiguousTopLevel.push('devCommand');
    }
    if (config.ignoreCommand != null) {
      ambiguousTopLevel.push('ignoreCommand');
    }
    if (config.outputDirectory != null) {
      ambiguousTopLevel.push('outputDirectory');
    }
    if (config.framework != null) {
      ambiguousTopLevel.push('framework');
    }

    if (ambiguousTopLevel.length > 0) {
      const count = ambiguousTopLevel.length;
      const fields = ambiguousTopLevel.map(field => `\`${field}\``).join(', ');
      return new NowBuildError({
        code: 'EXPERIMENTAL_SERVICES_V2_AND_TOP_LEVEL_BUILD_SETTINGS',
        message:
          `The top-level ${count > 1 ? 'properties' : 'property'} ${fields} cannot be used with \`experimentalServicesV2\` ` +
          `because the owning service is ambiguous. ` +
          `Move ${count > 1 ? 'them' : 'it'} under the relevant service in \`experimentalServicesV2\`.`,
      });
    }
  }

  if (config.experimentalServicesV2) {
    const serviceNames = new Set(Object.keys(config.experimentalServicesV2));
    for (const [serviceName, serviceConfig] of Object.entries(
      config.experimentalServicesV2
    )) {
      for (const binding of serviceConfig.bindings ?? []) {
        if (!serviceNames.has(binding.service)) {
          return new NowBuildError({
            code: 'EXPERIMENTAL_SERVICES_V2_BINDING_UNKNOWN_SERVICE',
            message:
              `Service "${serviceName}" declares a binding to unknown service "${binding.service}". ` +
              `Add "${binding.service}" to \`experimentalServicesV2\` or fix the binding.`,
          });
        }
      }
    }
  }

  return null;
}
