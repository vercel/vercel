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
    'production-origin-routing': {
      summary:
        'The runner invokes the CLI without --api and routes its production origins (https://vercel.com, https://api.vercel.com) to the fake API.',
      mechanism:
        'Runner-specific. The TypeScript runner preloads a guard that rewrites fetch requests for those origins to the fake API.',
    },
  },
};
