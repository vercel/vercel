import { describe, it, expect } from 'vitest';
import { OTEL_PACKAGES, OTEL_ALWAYS_BUNDLE_PACKAGES } from '../src/otel';

describe('otel constants', () => {
  it('OTEL_PACKAGES includes sdk, exporter, and protobuf', () => {
    expect(OTEL_PACKAGES).toEqual([
      'opentelemetry-sdk',
      'opentelemetry-exporter-otlp-proto-common',
      'protobuf',
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
    ]);
  });

  it('every OTEL_PACKAGES entry has a corresponding always-bundle entry', () => {
    for (const pkg of OTEL_PACKAGES) {
      expect(OTEL_ALWAYS_BUNDLE_PACKAGES).toContain(pkg);
    }
  });
});
