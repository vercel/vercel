import { FORMAT_VERSION, type ErrorsCatalog } from '../model/schemas';

/**
 * User-visible CLI errors. Ids align with Go port reason names where they
 * exist (for example `personal_scope_not_allowed`).
 */
export const errorsCatalog: ErrorsCatalog = {
  formatVersion: FORMAT_VERSION,
  errors: {
    logged_out: {
      summary: 'No credentials are available.',
      exitCode: 1,
      stderrContains: ['Logged out.', 'vercel deploy --temporary'],
    },
    personal_scope_not_allowed: {
      summary: 'A Northstar user passed their personal account as --scope.',
      exitCode: 1,
      stderrContains: ['You cannot set your Personal Account as the scope.'],
    },
    scope_teams_rate_limited: {
      summary: 'The teams list was rate limited while resolving --scope.',
      exitCode: 1,
      stderrContains: [
        'Rate limited. Too many requests to the same endpoint: /teams',
      ],
    },
  },
};
