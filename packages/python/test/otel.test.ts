import type { Distribution, DistributionIndex } from '@vercel/python-analysis';
import { afterEach, describe, expect, it } from 'vitest';
import {
  OTEL_ALWAYS_BUNDLE_PACKAGES,
  OTEL_INSTRUMENTATION_MAPPINGS,
  OTEL_PACKAGES,
  resolveOtelInstrumentationPackages,
} from '../src/otel';

function makeDist(name: string, version: string): Distribution {
  return {
    name,
    version,
    metadataVersion: '2.1',
    requiresDist: [],
    providesExtra: [],
    files: [],
  };
}

function makeDistIndex(...entries: [string, string][]): DistributionIndex {
  const map: DistributionIndex = new Map();
  for (const [name, version] of entries) {
    map.set(name, makeDist(name, version));
  }
  return map;
}

describe('otel constants', () => {
  it('OTEL_PACKAGES includes sdk, exporter, protobuf, and stdlib instrumentation', () => {
    expect(OTEL_PACKAGES).toEqual([
      'opentelemetry-sdk',
      'opentelemetry-exporter-otlp-proto-common',
      'protobuf',
      'opentelemetry-instrumentation-asyncio',
      'opentelemetry-instrumentation-logging',
      'opentelemetry-instrumentation-urllib',
    ]);
  });

  it('OTEL_ALWAYS_BUNDLE_PACKAGES includes dash and underscore variants', () => {
    expect(OTEL_ALWAYS_BUNDLE_PACKAGES).toEqual([
      'opentelemetry-sdk',
      'opentelemetry_sdk',
      'opentelemetry-exporter-otlp-proto-common',
      'opentelemetry_exporter_otlp_proto_common',
      'protobuf',
      'google',
      'opentelemetry-instrumentation-asyncio',
      'opentelemetry_instrumentation_asyncio',
      'opentelemetry-instrumentation-logging',
      'opentelemetry_instrumentation_logging',
      'opentelemetry-instrumentation-urllib',
      'opentelemetry_instrumentation_urllib',
    ]);
  });

  it('every OTEL_PACKAGES entry has a corresponding always-bundle entry', () => {
    for (const pkg of OTEL_PACKAGES) {
      expect(OTEL_ALWAYS_BUNDLE_PACKAGES).toContain(pkg);
    }
  });
});

describe('resolveOtelInstrumentationPackages', () => {
  // Temporarily override OTEL_INSTRUMENTATION_MAPPINGS for testing
  const originalMappings = [...OTEL_INSTRUMENTATION_MAPPINGS];

  function setMappings(mappings: typeof OTEL_INSTRUMENTATION_MAPPINGS) {
    OTEL_INSTRUMENTATION_MAPPINGS.length = 0;
    OTEL_INSTRUMENTATION_MAPPINGS.push(...mappings);
  }

  afterEach(() => {
    OTEL_INSTRUMENTATION_MAPPINGS.length = 0;
    OTEL_INSTRUMENTATION_MAPPINGS.push(...originalMappings);
  });

  it('returns empty when no mappings are defined', () => {
    setMappings([]);
    const result = resolveOtelInstrumentationPackages(
      makeDistIndex(['django', '4.2.0'])
    );
    expect(result.packages).toEqual([]);
    expect(result.alwaysBundlePackages).toEqual([]);
  });

  it('returns empty when distributions are empty', () => {
    setMappings([
      {
        instrumentationPackage: 'opentelemetry-instrumentation-django',
        appDependency: 'django',
        versionSpecifier: '>=3.0',
      },
    ]);
    const result = resolveOtelInstrumentationPackages(new Map());
    expect(result.packages).toEqual([]);
    expect(result.alwaysBundlePackages).toEqual([]);
  });

  it('returns empty when app dep is present but version is out of range', () => {
    setMappings([
      {
        instrumentationPackage: 'opentelemetry-instrumentation-django',
        appDependency: 'django',
        versionSpecifier: '>=5.0',
      },
    ]);
    const result = resolveOtelInstrumentationPackages(
      makeDistIndex(['django', '4.2.0'])
    );
    expect(result.packages).toEqual([]);
    expect(result.alwaysBundlePackages).toEqual([]);
  });

  it('returns instrumentation package when app dep matches version', () => {
    setMappings([
      {
        instrumentationPackage: 'opentelemetry-instrumentation-django',
        appDependency: 'django',
        versionSpecifier: '>=3.0,<6.0',
      },
    ]);
    const result = resolveOtelInstrumentationPackages(
      makeDistIndex(['django', '4.2.0'])
    );
    expect(result.packages).toEqual(['opentelemetry-instrumentation-django']);
    expect(result.alwaysBundlePackages).toEqual([
      'opentelemetry-instrumentation-django',
      'opentelemetry_instrumentation_django',
    ]);
  });

  it('only returns matching mappings when multiple are defined', () => {
    setMappings([
      {
        instrumentationPackage: 'opentelemetry-instrumentation-django',
        appDependency: 'django',
        versionSpecifier: '>=3.0',
      },
      {
        instrumentationPackage: 'opentelemetry-instrumentation-fastapi',
        appDependency: 'fastapi',
        versionSpecifier: '>=0.58',
      },
      {
        instrumentationPackage: 'opentelemetry-instrumentation-flask',
        appDependency: 'flask',
        versionSpecifier: '>=2.0',
      },
    ]);
    const result = resolveOtelInstrumentationPackages(
      makeDistIndex(['django', '4.2.0'], ['flask', '3.0.1'])
    );
    expect(result.packages).toEqual([
      'opentelemetry-instrumentation-django',
      'opentelemetry-instrumentation-flask',
    ]);
    expect(result.alwaysBundlePackages).toContain(
      'opentelemetry-instrumentation-django'
    );
    expect(result.alwaysBundlePackages).toContain(
      'opentelemetry_instrumentation_django'
    );
    expect(result.alwaysBundlePackages).toContain(
      'opentelemetry-instrumentation-flask'
    );
    expect(result.alwaysBundlePackages).toContain(
      'opentelemetry_instrumentation_flask'
    );
    expect(result.alwaysBundlePackages).not.toContain(
      'opentelemetry-instrumentation-fastapi'
    );
  });

  it('deduplicates when multiple app deps map to the same instrumentation package', () => {
    setMappings([
      {
        instrumentationPackage: 'opentelemetry-instrumentation-asgi',
        appDependency: 'django',
        versionSpecifier: '>=3.0',
      },
      {
        instrumentationPackage: 'opentelemetry-instrumentation-asgi',
        appDependency: 'fastapi',
        versionSpecifier: '>=0.58',
      },
    ]);
    const result = resolveOtelInstrumentationPackages(
      makeDistIndex(['django', '4.2.0'], ['fastapi', '0.100.0'])
    );
    expect(result.packages).toEqual(['opentelemetry-instrumentation-asgi']);
    expect(result.alwaysBundlePackages).toEqual([
      'opentelemetry-instrumentation-asgi',
      'opentelemetry_instrumentation_asgi',
    ]);
  });

  it('normalizes app dependency names for lookup', () => {
    setMappings([
      {
        instrumentationPackage: 'opentelemetry-instrumentation-urllib3',
        appDependency: 'urllib3',
        versionSpecifier: '>=1.0',
      },
    ]);
    // Distribution index uses normalized names (lowercase, hyphens → underscores)
    const dists: DistributionIndex = new Map();
    dists.set('urllib3', makeDist('urllib3', '2.1.0'));
    const result = resolveOtelInstrumentationPackages(dists);
    expect(result.packages).toEqual(['opentelemetry-instrumentation-urllib3']);
  });
});
