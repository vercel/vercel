import { packageName } from '../../util/pkg-name';

export const httpstatCommand = {
  name: 'httpstat',
  aliases: [],
  description:
    'Execute httpstat with automatic deployment URL and protection bypass to visualize HTTP timing statistics.',
  arguments: [
    {
      name: 'path',
      required: true,
    },
  ],
  options: [
    {
      name: 'deployment',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'The deployment ID or URL to target',
      argument: 'ID|URL',
    },
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
      name: 'Use curl flags after the separator',
      value: `${packageName} httpstat /api/test -- -H "Content-Type: application/json" -X PUT`,
    },
    {
      name: 'Use with protection bypass secret',
      value: `${packageName} httpstat /api/protected --protection-bypass <secret>`,
    },
  ],
} as const;
