/**
 * OpenTelemetry packages injected into every Python build.
 *
 * These are installed unconditionally via `uv pip install` so that
 * vercel-runtime's tracing module has everything it needs at cold start.
 */

import {
  normalizePackageName,
  pep440Satisfies,
  type DistributionIndex,
} from '@vercel/python-analysis';

/** Packages needed by custom span exporter */
export const BASE_OTEL_PACKAGES = [
  'opentelemetry-exporter-otlp-proto-common',
  'protobuf',
];

/** Packages to install if telemetry is auto */
export const OTEL_PACKAGES = [
  'opentelemetry-sdk',
  ...BASE_OTEL_PACKAGES,

  // stdlib instrumentation
  'opentelemetry-instrumentation-asyncio',
  'opentelemetry-instrumentation-logging',
  'opentelemetry-instrumentation-urllib',
];

/**
 * Packages the dependency externalizer must never split out of the bundle.
 * Includes both dash and underscore variants so the externalizer matches
 * regardless of normalisation.
 */
export const OTEL_ALWAYS_BUNDLE_PACKAGES = [
  'opentelemetry-sdk',
  'opentelemetry_sdk',
  'opentelemetry-exporter-otlp-proto-common',
  'opentelemetry_exporter_otlp_proto_common',
  'protobuf',
  'google',

  // stdlib instrumentation
  'opentelemetry-instrumentation-asyncio',
  'opentelemetry_instrumentation_asyncio',
  'opentelemetry-instrumentation-logging',
  'opentelemetry_instrumentation_logging',
  'opentelemetry-instrumentation-urllib',
  'opentelemetry_instrumentation_urllib',
];

export interface OtelInstrumentationMapping {
  /** App dependency that triggers installation, e.g. "django" */
  appDependency: string;
  /** PEP 440 version specifier the installed version must satisfy, e.g. ">=3.0,<6.0" */
  versionSpecifier: string;
  /** OTel instrumentation package to install, e.g. "opentelemetry-instrumentation-django" */
  instrumentationPackage: string;
}

/** Mapping of OTel instrumentation packages to their triggering app dependencies. */
export const OTEL_INSTRUMENTATION_MAPPINGS: OtelInstrumentationMapping[] = [
  // -- databases --
  // postgres
  {
    appDependency: 'asyncpg',
    versionSpecifier: '>= 0.12.0',
    instrumentationPackage: 'opentelemetry-instrumentation-asyncpg',
  },
  {
    appDependency: 'psycopg',
    versionSpecifier: '>= 3.1.0',
    instrumentationPackage: 'opentelemetry-instrumentation-psycopg',
  },
  {
    appDependency: 'psycopg2',
    versionSpecifier: '>= 2.7.3.1',
    instrumentationPackage: 'opentelemetry-instrumentation-psycopg2',
  },
  {
    appDependency: 'psycopg2-binary',
    versionSpecifier: '>= 2.7.3.1',
    instrumentationPackage: 'opentelemetry-instrumentation-psycopg2',
  },
  // mysql
  {
    appDependency: 'mysql-connector-python',
    versionSpecifier: '>= 8.0, < 10.0',
    instrumentationPackage: 'opentelemetry-instrumentation-mysql',
  },
  {
    appDependency: 'mysqlclient',
    versionSpecifier: '< 3',
    instrumentationPackage: 'opentelemetry-instrumentation-mysqlclient',
  },
  {
    appDependency: 'pymysql',
    versionSpecifier: '< 2',
    instrumentationPackage: 'opentelemetry-instrumentation-pymysql',
  },
  // mssql
  {
    appDependency: 'pymssql',
    versionSpecifier: '>= 2.1.5, < 3',
    instrumentationPackage: 'opentelemetry-instrumentation-pymssql',
  },
  // mongo
  {
    appDependency: 'pymongo',
    versionSpecifier: '>= 3.1, < 5.0',
    instrumentationPackage: 'opentelemetry-instrumentation-pymongo',
  },
  // redis
  {
    appDependency: 'redis',
    versionSpecifier: '>= 2.6',
    instrumentationPackage: 'opentelemetry-instrumentation-redis',
  },
  // cassandra
  {
    appDependency: 'cassandra-driver',
    versionSpecifier: '~= 3.25',
    instrumentationPackage: 'opentelemetry-instrumentation-cassandra',
  },
  {
    appDependency: 'scylla-driver',
    versionSpecifier: '~= 3.25',
    instrumentationPackage: 'opentelemetry-instrumentation-cassandra',
  },
  // elasticsearch
  {
    appDependency: 'elasticsearch',
    versionSpecifier: '>= 6.0',
    instrumentationPackage: 'opentelemetry-instrumentation-elasticsearch',
  },

  // -- orms --
  {
    appDependency: 'sqlalchemy',
    versionSpecifier: '>= 1.0.0, < 2.1.0',
    instrumentationPackage: 'opentelemetry-instrumentation-sqlalchemy',
  },

  // -- frameworks --
  {
    appDependency: 'django',
    versionSpecifier: '>= 2.0',
    instrumentationPackage: 'opentelemetry-instrumentation-django',
  },
  {
    appDependency: 'fastapi',
    versionSpecifier: '~= 0.92',
    instrumentationPackage: 'opentelemetry-instrumentation-fastapi',
  },
  {
    appDependency: 'flask',
    versionSpecifier: '>= 1.0',
    instrumentationPackage: 'opentelemetry-instrumentation-flask',
  },
  {
    appDependency: 'starlette',
    versionSpecifier: '>= 0.13',
    instrumentationPackage: 'opentelemetry-instrumentation-starlette',
  },
  {
    appDependency: 'tornado',
    versionSpecifier: '>= 5.1.1',
    instrumentationPackage: 'opentelemetry-instrumentation-tornado',
  },

  // -- http --
  {
    appDependency: 'aiohttp',
    versionSpecifier: '~= 3.0',
    instrumentationPackage: 'opentelemetry-instrumentation-aiohttp-client',
  },
  {
    appDependency: 'aiohttp',
    versionSpecifier: '~= 3.0',
    instrumentationPackage: 'opentelemetry-instrumentation-aiohttp-server',
  },
  {
    appDependency: 'httpx',
    versionSpecifier: '>= 0.18.0',
    instrumentationPackage: 'opentelemetry-instrumentation-httpx',
  },
  {
    appDependency: 'urllib3',
    versionSpecifier: '>= 1.0.0, < 3.0.0',
    instrumentationPackage: 'opentelemetry-instrumentation-urllib3',
  },
  {
    appDependency: 'requests',
    versionSpecifier: '~= 2.0',
    instrumentationPackage: 'opentelemetry-instrumentation-requests',
  },

  // -- queueing --
  // celery
  {
    appDependency: 'celery',
    versionSpecifier: '>= 4.0, < 6.0',
    instrumentationPackage: 'opentelemetry-instrumentation-celery',
  },
  // kafka
  {
    appDependency: 'kafka-python',
    versionSpecifier: '>= 2.0, < 3.0',
    instrumentationPackage: 'opentelemetry-instrumentation-kafka-python',
  },
  {
    appDependency: 'kafka-python-ng',
    versionSpecifier: '>= 2.0, < 3.0',
    instrumentationPackage: 'opentelemetry-instrumentation-kafka-python',
  },
  {
    appDependency: 'confluent-kafka',
    versionSpecifier: '>= 1.8.2, < 3.0.0',
    instrumentationPackage: 'opentelemetry-instrumentation-confluent-kafka',
  },
  {
    appDependency: 'aiokafka',
    versionSpecifier: '>= 0.8, < 1.0',
    instrumentationPackage: 'opentelemetry-instrumentation-aiokafka',
  },

  // -- aws --
  {
    appDependency: 'boto3',
    versionSpecifier: ' ~= 1.0',
    instrumentationPackage: 'opentelemetry-instrumentation-boto3sqs',
  },
  {
    appDependency: 'botocore',
    versionSpecifier: '~= 1.0,',
    instrumentationPackage: 'opentelemetry-instrumentation-botocore',
  },
  {
    appDependency: 'aiobotocore',
    versionSpecifier: '~= 2.0',
    instrumentationPackage: 'opentelemetry-instrumentation-botocore',
  },
];

export interface ResolvedOtelInstrumentation {
  /** Packages to `uv pip install` */
  packages: string[];
  /** Packages to add to alwaysBundlePackages (dash + underscore variants) */
  alwaysBundlePackages: string[];
}

/**
 * Resolves which OTel instrumentation packages should be installed based on
 * the app's installed dependencies and version compatibility.
 */
export function resolveOtelInstrumentationPackages(
  distributions: DistributionIndex
): ResolvedOtelInstrumentation {
  const packages = new Set<string>();
  const alwaysBundlePackages = new Set<string>();

  for (const mapping of OTEL_INSTRUMENTATION_MAPPINGS) {
    const normalized = normalizePackageName(mapping.appDependency);
    const dist = distributions.get(normalized);
    if (!dist) continue;

    if (pep440Satisfies(dist.version, mapping.versionSpecifier)) {
      packages.add(mapping.instrumentationPackage);
      alwaysBundlePackages.add(mapping.instrumentationPackage);
      alwaysBundlePackages.add(
        mapping.instrumentationPackage.replace(/-/g, '_')
      );
    }
  }

  return {
    packages: [...packages],
    alwaysBundlePackages: [...alwaysBundlePackages],
  };
}
