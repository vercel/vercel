import Ajv from 'ajv';
import {
  routesSchema,
  cleanUrlsSchema,
  headersSchema,
  redirectsSchema,
  rewritesSchema,
  trailingSlashSchema,
} from '@vercel/routing-utils';
import type { VercelConfig } from '@vercel/client';
import {
  functionsSchema,
  buildsSchema,
  NowBuildError,
  getPrettyError,
} from '@vercel/build-utils';
import { fileNameSymbol } from '@vercel/client';

const servicesSchema = {
  type: 'array',
  minItems: 1,
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['type', 'entry'],
    properties: {
      type: { enum: ['web'] },
      entry: { type: 'string', minLength: 1, maxLength: 512 },
      prefix: { type: 'string', minLength: 1, maxLength: 256 },
      framework: { type: 'string', minLength: 1, maxLength: 128 },
      builder: { type: 'string', minLength: 1, maxLength: 256 },
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
    },
  },
} as const;

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

const vercelConfigSchema = {
  type: 'object',
  // These are not all possibilities because `vc dev`
  // doesn't need to know about `regions`, `public`, etc.
  additionalProperties: true,
  properties: {
    builds: buildsSchema,
    services: servicesSchema,
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

  // Services-specific validations
  const cfgAny = config as any;
  if (Array.isArray(cfgAny.services)) {
    if (config.builds) {
      return new NowBuildError({
        code: 'SERVICES_AND_BUILDS',
        message:
          'The `services` property cannot be used in conjunction with the `builds` property. Please remove one of them.',
        link: 'https://vercel.link/services-config', // TODO: add actual docs
      });
    }
    if (config.functions) {
      return new NowBuildError({
        code: 'SERVICES_AND_FUNCTIONS',
        message:
          'The `services` property cannot be used in conjunction with the `functions` property. Please remove one of them.',
        link: 'https://vercel.link/services-config', // TODO: add actual docs
      });
    }

    // Validate prefixes: at most one service without prefix, no dupes, no overlaps
    const services: any[] = cfgAny.services as any[];
    const prefixes: string[] = services
      .map((s: any) => (typeof s.prefix === 'string' ? s.prefix : undefined))
      .filter((p: string | undefined): p is string => Boolean(p));

    const noPrefixCount = services.length - prefixes.length;
    if (noPrefixCount > 1) {
      return new NowBuildError({
        code: 'SERVICES_MULTIPLE_ROOT',
        message:
          'Only one service may omit the `prefix` property. Please ensure at most one root service exists.',
        link: 'https://vercel.link/services-config',
      });
    }

    const seen = new Set<string>();
    for (const p of prefixes) {
      if (seen.has(p)) {
        return new NowBuildError({
          code: 'SERVICES_PREFIX_DUPLICATE',
          message: `Duplicate service prefix detected: "${p}". Service prefixes must be unique.`,
          link: 'https://vercel.link/services-config',
        });
      }
      seen.add(p);
    }

    // Overlap check: no prefix may be a prefix of another (e.g. '/api' and '/api/admin')
    const normalized = prefixes.map((p: string) =>
      p.endsWith('/') ? p.slice(0, -1) : p
    );
    for (let i = 0; i < normalized.length; i++) {
      for (let j = i + 1; j < normalized.length; j++) {
        const a = normalized[i];
        const b = normalized[j];
        if (a === b || a.startsWith(b + '/') || b.startsWith(a + '/')) {
          return new NowBuildError({
            code: 'SERVICES_PREFIX_CONFLICT',
            message: `Conflicting service prefixes detected: "${a}" and "${b}" overlap. Please choose non-overlapping prefixes.`,
            link: 'https://vercel.link/services-config',
          });
        }
      }
    }
  }

  return null;
}
