import { packageName } from '../../util/pkg-name';

/**
 * DO NOT MERGE — this command exists only to demonstrate that the API
 * endpoint policy check blocks non-compliant commands in CI. It violates
 * the policy in two ways (see packages/cli/docs/api-endpoint-policy.md):
 *
 * 1. `policy-demo status` does not declare `endpoints` at all.
 * 2. `policy-demo inspect` declares a private endpoint (not in the public
 *    OpenAPI spec) without being marked `beta: true`.
 */
export const policyDemoCommand = {
  name: 'policy-demo',
  aliases: [],
  description: 'Demonstrates API endpoint policy violations (do not merge)',
  hidden: true,
  arguments: [],
  subcommands: [
    {
      name: 'status',
      aliases: [],
      description: 'New subcommand that forgot to declare its endpoints',
      arguments: [],
      options: [],
      examples: [],
    },
    {
      name: 'inspect',
      aliases: [],
      description: 'New subcommand using a private endpoint without beta',
      endpoints: [{ method: 'GET', path: '/v1/oauth-apps/installations' }],
      arguments: [],
      options: [],
      examples: [],
    },
  ],
  options: [],
  examples: [
    {
      name: 'Trigger the policy check',
      value: `${packageName} policy-demo status`,
    },
  ],
} as const;
