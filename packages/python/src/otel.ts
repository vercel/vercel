/**
 * OpenTelemetry packages injected into every Python build.
 *
 * These are installed unconditionally via `uv pip install` so that
 * vercel-runtime's tracing module has everything it needs at cold start.
 */

/** Packages to `uv pip install` into the venv. */
export const OTEL_PACKAGES = [
  'opentelemetry-sdk',
  'opentelemetry-exporter-otlp-proto-common',
  'protobuf',
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
];
