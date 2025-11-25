import { packageName } from '../../util/pkg-name';

export const curlCommand = {
  name: 'curl',
  aliases: [],
  description:
    'Execute curl with automatic deployment URL and protection bypass.',
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
      name: 'Make a GET request to an API endpoint',
      value: `${packageName} curl /api/hello`,
    },
    {
      name: 'Make a POST request with data',
      value: `${packageName} curl /api/users -- --request POST --data '{"name": "John"}'`,
    },
    {
      name: 'Target a specific deployment by ID',
      value: `${packageName} curl /api/status --deployment ERiL45NJvP8ghWxgbvCM447bmxwV`,
    },
    {
      name: 'Target a specific deployment by URL',
      value: `${packageName} curl /api/status --deployment https://your-project-abc123.vercel.app`,
    },
    {
      name: 'Use curl flags after the separator',
      value: `${packageName} curl /api/test -- --header "Content-Type: application/json" --request PUT`,
    },
    {
      name: 'Use with protection bypass secret',
      value: `${packageName} curl /api/protected --protection-bypass <secret> -- --request GET`,
    },
  ],
} as const;
