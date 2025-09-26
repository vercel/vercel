import { packageName } from '../../util/pkg-name';

export const curlCommand = {
  name: 'curl',
  aliases: [],
  description:
    'Send curl requests to your Vercel deployment. All curl options are supported. Automatically includes authentication if logged in.',
  arguments: [
    {
      name: 'path',
      required: false,
    },
    {
      name: '...curl-args',
      required: false,
    },
  ],
  options: [
    {
      name: 'prod',
      description: 'Target the production environment',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'production',
      description: 'Target the production environment',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'environment',
      description:
        'Target a specific environment (production, preview, or custom)',
      shorthand: 'e',
      argument: 'NAME',
      type: String,
      deprecated: false,
    },
    {
      name: 'sha',
      description: 'Target a specific deployment by SHA',
      shorthand: null,
      argument: 'SHA',
      type: String,
      deprecated: false,
    },
    {
      name: 'cwd',
      description: 'Current working directory to resolve linked project from',
      shorthand: null,
      argument: 'DIR',
      type: String,
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Send a GET request to your deployment',
      value: `${packageName} curl /api/hello`,
    },
    {
      name: 'Send a request to production environment',
      value: `${packageName} curl /api/hello --prod`,
    },
    {
      name: 'Send a request to a specific environment',
      value: `${packageName} curl /api/hello --environment staging`,
    },
    {
      name: 'Send a request to a specific deployment by SHA',
      value: `${packageName} curl /api/hello --sha abcd1234`,
    },
    {
      name: 'Send a POST request with data',
      value: `${packageName} curl /api/users -d '{"name":"John"}' --prod`,
    },
    {
      name: 'Send a request with custom headers',
      value: `${packageName} curl /api/protected -H "Authorization: Bearer token"`,
    },
    {
      name: 'Send a request with custom HTTP method',
      value: `${packageName} curl /api/users/123 -X DELETE`,
    },
    {
      name: 'Use any curl option',
      value: `${packageName} curl /api/status -i -s --max-time 30`,
    },
    {
      name: 'Target project in a specific directory',
      value: `${packageName} curl /api/hello --cwd /path/to/project`,
    },
  ],
} as const;
