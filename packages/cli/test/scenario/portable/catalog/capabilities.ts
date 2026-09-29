import { FORMAT_VERSION, type CapabilitiesCatalog } from '../model/schemas';

/**
 * Optional runner/CLI features. A runner that does not implement a required
 * capability reports the scenario as skipped, never as passed.
 */
export const capabilitiesCatalog: CapabilitiesCatalog = {
  formatVersion: FORMAT_VERSION,
  capabilities: {
    'app-principal': {
      summary:
        'The CLI treats app tokens as principals, identified through OAuth token introspection.',
      mechanism:
        'Runner-specific. The TypeScript runner sets APP_PRINCIPAL_ENABLED=1.',
    },
    'oauth-test-issuer': {
      summary:
        'The runner can point OAuth discovery and introspection at the fake API origin.',
      mechanism:
        'Runner-specific. The TypeScript runner sets VERCEL_CLI_INTERNAL_TEST_OAUTH_ISSUER=<fake API origin>.',
    },
  },
};
