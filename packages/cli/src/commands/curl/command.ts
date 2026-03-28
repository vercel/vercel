import { packageName } from '../../util/pkg-name';
import { yesOption } from '../../util/arg-common';

export const curlCommand = {
  name: 'curl',
  aliases: [],
  description:
    'Execute curl with automatic deployment URL and protection bypass.',
  arguments: [
    {
      name: 'url',
      required: true,
    },
  ],
  options: [
    {
      ...yesOption,
      description:
        'Skip confirmation when linking is required (e.g. in non-interactive mode)',
    },
    {
      name: 'deployment',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'The deployment ID or URL to use as the base (with a relative path)',
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
      name: 'Curl a full deployment URL directly',
      value: `${packageName} curl https://my-app.vercel.app/api/hello`,
    },
    {
      name: 'Make a POST request',
      value: `${packageName} curl https://my-app.vercel.app/api/users -X POST -d '{"name": "John"}'`,
    },
    {
      name: 'Use a relative path (resolves from linked project)',
      value: `${packageName} curl /api/hello`,
    },
    {
      name: 'Relative path with a specific deployment',
      value: `${packageName} curl /api/status --deployment dpl_ERiL45NJvP8ghWxgbvCM447bmxwV`,
    },
    {
      name: 'Add custom headers',
      value: `${packageName} curl /api/test -H "Content-Type: application/json" -X PUT`,
    },
    {
      name: 'With protection bypass secret',
      value: `${packageName} curl /api/protected --protection-bypass <secret>`,
    },
  ],
} as const;
