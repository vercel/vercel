import { packageName } from '../../util/pkg-name';
import {
  deploymentOption,
  protectionBypassOption,
  yesOption,
} from '../../util/arg-common';

export const curlCommand = {
  name: 'curl',
  aliases: [],
  description:
    'Make curl requests to Vercel deployments with automatic protection bypass.',
  arguments: [
    {
      name: 'path',
      required: true,
    },
  ],
  options: [
    {
      ...yesOption,
      description:
        'Skip confirmation when linking is required (e.g. in non-interactive mode)',
    },
    deploymentOption,
    protectionBypassOption,
    {
      name: 'trace',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Capture a session trace for the request and print the trace request id',
    },
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'With --trace, emit { response, requestId } as JSON on stdout',
    },
  ],
  examples: [
    {
      name: 'Access a protected deployment URL',
      value: `${packageName} curl https://your-project-abc123.vercel.app/api/hello`,
    },
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
    {
      name: 'Capture a session trace for the request',
      value: `${packageName} curl --trace /api/hello`,
    },
  ],
} as const;
