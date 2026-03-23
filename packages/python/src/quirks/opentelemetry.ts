import type { Quirk, QuirkResult } from './index';

/**
 * When the user installs `opentelemetry-sdk`, inject the additional
 * packages required by vercel-runtime's tracing module:
 * - `opentelemetry-exporter-otlp-proto-common` (for `encode_spans`)
 * - `protobuf` (for `google.protobuf.json_format.MessageToDict`)
 */
export const opentelemetryQuirk: Quirk = {
  dependency: 'opentelemetry-sdk',
  async run(): Promise<QuirkResult> {
    return {
      additionalPackages: [
        'opentelemetry-exporter-otlp-proto-common',
        'protobuf',
      ],
      alwaysBundlePackages: [
        'opentelemetry-exporter-otlp-proto-common',
        'opentelemetry_exporter_otlp_proto_common',
        'protobuf',
        'google',
      ],
    };
  },
};
