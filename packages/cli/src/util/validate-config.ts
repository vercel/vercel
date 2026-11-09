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
  getMaxDurationSchema,
  NowBuildError,
  getPrettyError,
  DAEMON_NAME_PATTERN,
  type ServiceConfig,
  SERVICE_NAME_PATTERN,
} from '@vercel/build-utils';
import { fileNameSymbol } from '@vercel/client/dist/types';
import { validateProxyConfig } from '@vercel/fs-detectors';
import { getConfigValidator } from './config-validator';

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

const scheduleNameSchema = {
  type: 'string',
  minLength: 1,
  maxLength: 256,
  pattern: '^[0-9A-Za-z][0-9A-Za-z._-]*$',
};

// Extends the server-side Build Output API schema with entrypoints that the
// build resolves to function output paths. The name is the schedule's key.
const scheduleDefinitionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['schedule'],
  properties: {
    schedule: {
      type: 'string',
      minLength: 9,
      maxLength: 256,
    },
    timezone: {
      type: 'string',
      minLength: 1,
      maxLength: 50,
      description: 'IANA timezone for cron evaluation. Defaults to UTC.',
    },
    jitter: {
      type: 'integer',
      minimum: 1,
      maximum: 15,
    },
    path: {
      description:
        'Deployment path to invoke over HTTP, like `crons[].path`. Must start with `/`.',
      type: 'string',
      maxLength: 512,
      pattern: '^/',
    },
    requestMethod: {
      description:
        'HTTP method used to invoke `path`. Only valid with `path`. Defaults to `POST`.',
      enum: ['GET', 'POST'],
    },
    function: {
      type: 'string',
      minLength: 1,
    },
    service: {
      description:
        'Service that owns `function`, from `services`. When set, `function` is the path within that service. Only valid with `function`.',
      type: 'string',
      minLength: 1,
      maxLength: 64,
      pattern: '^[a-z]([a-z_-]*[a-z])?$',
    },
    topic: {
      type: 'string',
      minLength: 1,
      maxLength: 256,
      pattern: '^[A-Za-z0-9_-]+$',
    },
    command: {
      description:
        'Command to run for each firing. Only valid with a Dockerfile or Containerfile entrypoint.',
      type: 'array',
      minItems: 1,
      items: [{ type: 'string', pattern: '\\S' }],
      additionalItems: { type: 'string' },
    },
    root: {
      description:
        'Directory of the service that runs `command`. `entrypoint` is relative to it. Only valid with `command`.',
      type: 'string',
      minLength: 1,
      maxLength: 512,
    },
    entrypoint: {
      type: 'string',
      minLength: 1,
      maxLength: 512,
    },
  },
  dependencies: {
    requestMethod: ['path'],
    service: ['function'],
    command: ['entrypoint', 'root'],
    root: ['command'],
  },
  oneOf: [
    { required: ['path'] },
    { required: ['function'] },
    { required: ['topic'] },
    { required: ['entrypoint'] },
  ],
};

// Matches the API's cap.
const maxSchedules = 100;

const schedulesSchema = {
  type: 'object',
  maxProperties: maxSchedules,
  propertyNames: scheduleNameSchema,
  additionalProperties: scheduleDefinitionSchema,
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

const servicesPathSchema = {
  type: 'string',
  minLength: 1,
  maxLength: 512,
};

const servicesCommandSchema = {
  type: 'string',
  minLength: 1,
  maxLength: 2048,
};

const servicesBindingSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['service', 'format', 'env'],
  properties: {
    type: {
      description:
        'Optional binding type marker. Currently the only supported type is `service`. When present this must be `service`.',
      const: 'service',
    },
    service: {
      type: 'string',
      minLength: 1,
      maxLength: 64,
      pattern: SERVICE_NAME_PATTERN,
    },
    format: { const: 'url' },
    env: {
      type: 'string',
      ...envVarNamesSchema,
    },
  },
};

const servicesBindingsSchema = {
  type: 'array',
  maxItems: 100,
  items: servicesBindingSchema,
};

const getServicesServiceConfigSchema = () => ({
  type: 'object',
  additionalProperties: false,
  required: ['root'],
  properties: {
    root: servicesPathSchema,
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
    entrypoint: servicesPathSchema,
    command: {
      oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    },
    installCommand: servicesCommandSchema,
    buildCommand: servicesCommandSchema,
    devCommand: servicesCommandSchema,
    ignoreCommand: servicesCommandSchema,
    outputDirectory: servicesPathSchema,
    bindings: servicesBindingsSchema,
    functions: getFunctionsSchema(),
    headers: headersSchema,
    redirects: redirectsSchema,
    rewrites: rewritesSchema,
    routes: routesSchema,
    cleanUrls: cleanUrlsSchema,
    trailingSlash: trailingSlashSchema,
  },
});

const daemonConfigSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['root', 'entrypoint'],
  anyOf: [{ required: ['instances'] }, { required: ['replicas'] }],
  properties: {
    root: servicesPathSchema,
    entrypoint: servicesPathSchema,
    command: {
      type: 'array',
      minItems: 1,
      maxItems: 128,
      items: { type: 'string', minLength: 1, maxLength: 4096 },
    },
    instances: {
      type: 'object',
      additionalProperties: { type: 'integer', minimum: 0 },
    },
    replicas: {
      description:
        'Deprecated. Use `instances`. Ignored when `instances` is set.',
      deprecated: true,
      type: 'object',
      additionalProperties: { type: 'integer', minimum: 0 },
    },
    resources: {
      type: 'object',
      additionalProperties: false,
      required: ['requests'],
      properties: {
        requests: {
          type: 'object',
          additionalProperties: false,
          required: ['memory'],
          properties: { memory: { enum: ['1Gi', '2Gi', '4Gi', '8Gi'] } },
        },
      },
    },
    terminationGracePeriodSeconds: { type: 'integer', minimum: 0 },
    livenessProbe: {
      type: 'object',
      additionalProperties: false,
      required: ['httpGet'],
      properties: {
        httpGet: {
          type: 'object',
          additionalProperties: false,
          required: ['port'],
          properties: {
            path: { type: 'string', minLength: 1 },
            port: { type: 'integer', minimum: 1, maximum: 65535 },
            host: { type: 'string', minLength: 1 },
            scheme: { enum: ['HTTP', 'HTTPS'] },
            httpHeaders: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['name', 'value'],
                properties: {
                  name: { type: 'string', minLength: 1 },
                  value: { type: 'string' },
                },
              },
            },
          },
        },
        initialDelaySeconds: { type: 'integer', minimum: 0, maximum: 86400 },
        periodSeconds: { type: 'integer', minimum: 1, maximum: 86400 },
        timeoutSeconds: { type: 'integer', minimum: 1, maximum: 86400 },
        successThreshold: { type: 'integer', minimum: 1, maximum: 10 },
        failureThreshold: { type: 'integer', minimum: 1, maximum: 10 },
      },
    },
    // Unlike on services, the binding type is required, as it is in the API.
    bindings: {
      ...servicesBindingsSchema,
      items: {
        ...servicesBindingSchema,
        required: ['type', ...servicesBindingSchema.required],
      },
    },
  },
};

const getServicesSchema = () => ({
  type: 'object',
  propertyNames: {
    pattern: SERVICE_NAME_PATTERN,
    maxLength: 64,
  },
  additionalProperties: getServicesServiceConfigSchema(),
});

// Matches the API's cap.
const maxDaemons = 100;

const daemonsSchema = {
  type: 'object',
  maxProperties: maxDaemons,
  propertyNames: {
    pattern: DAEMON_NAME_PATTERN,
    maxLength: 64,
  },
  additionalProperties: daemonConfigSchema,
};

const proxySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['entrypoint'],
  properties: {
    entrypoint: {
      type: 'string',
      minLength: 1,
    },
    matcher: {
      oneOf: [
        {
          type: 'string',
          minLength: 1,
        },
        {
          type: 'array',
          minItems: 1,
          items: {
            type: 'string',
            minLength: 1,
          },
        },
      ],
    },
  },
};

export function buildVercelConfigSchema() {
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
      schedules: schedulesSchema,
      bunVersion: { type: 'string' },
      proxy: proxySchema,
      experimentalServices: getExperimentalServicesSchema(),
      experimentalServiceGroups: experimentalServiceGroupsSchema,
      services: getServicesSchema(),
      experimentalServicesV2: getServicesSchema(),
      daemons: daemonsSchema,
    },
  };
}

// Split on both path separators so the answer doesn't depend on the OS.
const isDockerfilePath = (path: string) =>
  /(docker|container)file/i.test(path.split(/[\\/]/).pop() ?? '');

export function validateConfig(config: VercelConfig): NowBuildError | null {
  const validate = getConfigValidator(buildVercelConfigSchema);
  if (!validate(config)) {
    if (validate.errors && validate.errors[0]) {
      const error = validate.errors[0];
      const fileName = config[fileNameSymbol] || 'vercel.json';
      const niceError = getPrettyError(error);
      niceError.message = `Invalid ${fileName} - ${niceError.message}`;
      return niceError;
    }
  }

  const serviceNames = new Set([
    ...Object.keys(config.services ?? {}),
    ...Object.keys(config.daemons ?? {}),
  ]);
  const invalidCommand = (message: string) =>
    new NowBuildError({
      code: 'INVALID_SCHEDULE_COMMAND',
      message: `Invalid ${config[fileNameSymbol] || 'vercel.json'} - ${message}`,
    });
  for (const [name, schedule] of Object.entries(config.schedules ?? {})) {
    const path = `schedules.${name}`;
    if ('command' in schedule) {
      if (!isDockerfilePath(schedule.entrypoint)) {
        return invalidCommand(
          `\`${path}.command\` requires a Dockerfile or Containerfile \`entrypoint\`.`
        );
      }
      // A command schedule is built as a service named after the schedule.
      if (name.length > 64 || !new RegExp(SERVICE_NAME_PATTERN).test(name)) {
        return invalidCommand(
          `\`${path}\` runs a command, so its name must be a valid service name: lowercase letters, \`-\` and \`_\`, at most 64 characters.`
        );
      }
      if (serviceNames.has(name)) {
        return invalidCommand(
          `\`${path}\` runs a command as service "${name}", which is already the name of a service or daemon.`
        );
      }
    }
    if (schedule.timezone === undefined) continue;
    try {
      // Intl also accepts numeric UTC offsets on newer Node.js versions.
      if (!/^[A-Za-z][A-Za-z0-9_+/-]*$/.test(schedule.timezone)) {
        throw new RangeError('Expected a named timezone');
      }
      new Intl.DateTimeFormat('en-US', { timeZone: schedule.timezone });
    } catch {
      return new NowBuildError({
        code: 'INVALID_SCHEDULE_TIMEZONE',
        message: `Invalid ${config[fileNameSymbol] || 'vercel.json'} - \`schedules.${name}.timezone\` must be a valid IANA timezone, such as "America/New_York". Omit it to use UTC.`,
      });
    }
  }

  const functionMaps = [
    config.functions,
    ...Object.values(config.services ?? {}).map(service => service.functions),
    ...Object.values(config.experimentalServicesV2 ?? {}).map(
      service => service.functions
    ),
  ];
  for (const functions of functionMaps) {
    for (const [pattern, fn] of Object.entries(functions ?? {})) {
      const regions = [...new Set(fn.regions)];
      if (
        fn.affinity?.mode === 'strict' &&
        (regions.includes('all') || regions.length > 1)
      ) {
        return new NowBuildError({
          code: 'INVALID_FUNCTION_AFFINITY_REGIONS',
          message: `Function affinity mode "strict" requires at most one statically configured region. Update \`functions[${JSON.stringify(
            pattern
          )}].regions\` to contain a single region.`,
          link: 'https://vercel.com/docs/concepts/projects/project-configuration#functions',
        });
      }
    }
  }

  if (config.proxy) {
    const proxyError = validateProxyConfig(config.proxy);
    if (proxyError) {
      return new NowBuildError({
        code: proxyError.code.toUpperCase(),
        message: proxyError.message,
      });
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

  if (config.proxy && config.builds) {
    return new NowBuildError({
      code: 'PROXY_AND_BUILDS',
      message:
        'The `proxy` property cannot be used with the `builds` property. Remove `builds` to use an explicit proxy entrypoint.',
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

  const hasServices = config.services != null;
  const hasExperimentalServicesV2 = config.experimentalServicesV2 != null;

  if (hasServices && hasExperimentalServicesV2) {
    return new NowBuildError({
      code: 'SERVICES_AND_EXPERIMENTAL_SERVICES_V2',
      message:
        'The `services` property cannot be used in conjunction with its deprecated alias `experimentalServicesV2`. Please use only `services`.',
    });
  }

  const servicesConfig = config.services ?? config.experimentalServicesV2;
  const servicesConfigKey = hasServices ? 'services' : 'experimentalServicesV2';
  const servicesErrorCodePrefix = hasServices
    ? 'SERVICES'
    : 'EXPERIMENTAL_SERVICES_V2';

  if (servicesConfig && hasExperimentalServices) {
    return new NowBuildError({
      code: `${servicesErrorCodePrefix}_AND_EXPERIMENTAL_SERVICES`,
      message: `The \`${servicesConfigKey}\` property cannot be used in conjunction with the \`experimentalServices\` property. Please use only one services configuration.`,
    });
  }

  if (servicesConfig && config.builds) {
    return new NowBuildError({
      code: `${servicesErrorCodePrefix}_AND_BUILDS`,
      message: `The \`${servicesConfigKey}\` property cannot be used in conjunction with the \`builds\` property. Please remove one of them.`,
    });
  }

  // In services mode some fields can be present only in service declarations.
  if (servicesConfig) {
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
        code: `${servicesErrorCodePrefix}_AND_TOP_LEVEL_BUILD_SETTINGS`,
        message:
          `The top-level ${count > 1 ? 'properties' : 'property'} ${fields} cannot be used with \`${servicesConfigKey}\` ` +
          `because the owning service is ambiguous. ` +
          `Move ${count > 1 ? 'them' : 'it'} under the relevant service in \`${servicesConfigKey}\`.`,
      });
    }
  }

  // Before the service binding checks, so a binding to a daemon gets the
  // daemon error rather than an unknown-service one.
  if (config.daemons) {
    const daemonError = validateDaemons(config, config.daemons);
    if (daemonError) {
      return daemonError;
    }
  }

  if (servicesConfig) {
    const serviceNames = new Set(Object.keys(servicesConfig));
    for (const [serviceName, serviceConfig] of Object.entries(servicesConfig)) {
      for (const binding of serviceConfig.bindings ?? []) {
        if (!serviceNames.has(binding.service)) {
          return new NowBuildError({
            code: `${servicesErrorCodePrefix}_BINDING_UNKNOWN_SERVICE`,
            message:
              `Service "${serviceName}" declares a binding to unknown service "${binding.service}". ` +
              `Add "${binding.service}" to \`${servicesConfigKey}\` or fix the binding.`,
          });
        }
      }
    }
  }

  return null;
}

function validateDaemons(
  config: VercelConfig,
  daemons: NonNullable<VercelConfig['daemons']>
): NowBuildError | null {
  const invalid = (message: string) =>
    new NowBuildError({
      code: 'INVALID_DAEMON',
      message,
    });
  const daemonNames = new Set(Object.keys(daemons));

  for (const [name, daemon] of Object.entries(daemons)) {
    // The container builder only builds Dockerfiles for daemons today.
    if (!isDockerfilePath(daemon.entrypoint)) {
      return invalid(
        `Daemon "${name}" must set \`entrypoint\` to a Dockerfile or Containerfile.`
      );
    }
  }

  const services: Record<string, ServiceConfig> = {
    ...config.experimentalServicesV2,
    ...config.services,
  };
  // Daemons and services have separate namespaces, so `{ service: "x" }`
  // only targets a daemon when no service is named "x".
  const isDaemonTarget = (name: string) =>
    daemonNames.has(name) &&
    !Object.prototype.hasOwnProperty.call(services, name);

  for (const [name, service] of Object.entries(services)) {
    const binding = service.bindings?.find(binding =>
      isDaemonTarget(binding.service)
    );
    if (binding) {
      return invalid(
        `Service "${name}" cannot bind to daemon "${binding.service}" because daemons do not receive traffic.`
      );
    }
  }

  for (const [name, daemon] of Object.entries(daemons)) {
    const envs = new Set<string>();
    for (const binding of daemon.bindings ?? []) {
      if (!Object.prototype.hasOwnProperty.call(services, binding.service)) {
        return invalid(
          `Daemon "${name}" declares a binding to unknown service "${binding.service}". Add "${binding.service}" to \`services\` or fix the binding.`
        );
      }
      if (envs.has(binding.env)) {
        return invalid(
          `Daemon "${name}" declares more than one binding for the environment variable "${binding.env}".`
        );
      }
      envs.add(binding.env);
    }
  }

  const destinations = [
    ...(config.rewrites ?? []),
    ...(config.routes ?? []),
    ...Object.values(services).flatMap(service => [
      ...(service.rewrites ?? []),
      ...(service.routes ?? []),
    ]),
  ].map(entry => ('destination' in entry ? entry.destination : undefined));
  for (const destination of destinations) {
    if (
      typeof destination === 'object' &&
      destination !== null &&
      isDaemonTarget(destination.service)
    ) {
      return invalid(
        `Rewrites and routes cannot target daemon "${destination.service}" because daemons do not receive traffic.`
      );
    }
  }

  return null;
}
