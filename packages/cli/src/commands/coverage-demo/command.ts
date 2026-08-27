import { packageName } from '../../util/pkg-name';

/**
 * DO NOT MERGE — demonstrates that declaring only public endpoints while
 * calling a private API fails the static fetch coverage check in
 * `test/unit/util/api-endpoint-policy.test.ts`.
 *
 * `endpoints` lists the public `GET /v2/user`, but `index.ts` also calls
 * the private `GET /v1/oauth-apps/installations`.
 */
export const coverageDemoCommand = {
  name: 'coverage-demo',
  aliases: [],
  description: 'Demonstrates incomplete endpoint declarations (do not merge)',
  hidden: true,
  arguments: [],
  options: [],
  examples: [
    {
      name: 'Trigger the coverage check',
      value: `${packageName} coverage-demo`,
    },
  ],
  endpoints: [{ method: 'GET', path: '/v2/user' }],
} as const;
