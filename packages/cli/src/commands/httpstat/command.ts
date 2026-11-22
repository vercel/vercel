import { packageName } from '../../util/pkg-name';
import { deploymentOption, yesOption } from '../../util/arg-common';

export const httpstatCommand = {
  name: 'httpstat',
  aliases: [],
  summary: 'Show deployment HTTP timing',
  description:
    'Execute httpstat with automatic deployment URL and protection bypass to visualize HTTP timing statistics.',
  arguments: [
    {
      name: 'path',
      required: true,
    },
  ],
  // Options it doesn't define go to httpstat.
  forwardsUnknownOptions: true,
  options: [
    {
      ...yesOption,
      description:
        'Skip confirmation when linking is required (e.g. in non-interactive mode)',
    },
    deploymentOption,
    {
      name: 'protection-bypass',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Protection bypass secret for accessing protected deployments',
      argument: 'SECRET',
    },
  ],
  examples: [
    {
      name: 'Visualize timing for a GET request to an API endpoint',
      value: `${packageName} httpstat /api/hello`,
    },
    {
      name: 'Make a POST request with data and see timing details',
      value: `${packageName} httpstat /api/users -- -X POST -d '{"name": "John"}'`,
    },
    {
      name: 'Target a specific deployment by ID',
      value: `${packageName} httpstat /api/status --deployment ERiL45NJvP8ghWxgbvCM447bmxwV`,
    },
    {
      name: 'Use curl options after the separator',
      value: `${packageName} httpstat /api/test -- -H "Content-Type: application/json" -X PUT`,
    },
    {
      name: 'Use with protection bypass secret',
      placeholders: ['<secret>'],
      value: `${packageName} httpstat /api/protected --protection-bypass <secret>`,
    },
  ],
} as const;
