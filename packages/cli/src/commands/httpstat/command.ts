import { packageName } from '../../util/pkg-name';

export const httpstatCommand = {
  name: 'httpstat',
  aliases: [],
  description:
    'Analyze HTTP requests to your Vercel deployment with timing statistics. Automatically includes authentication if logged in.',
  arguments: [
    {
      name: 'url',
      required: false,
    },
    {
      name: '...httpstat-args',
      required: false,
    },
  ],
  options: [
    {
      name: 'method',
      description: 'HTTP method to use (GET, POST, PUT, etc.)',
      shorthand: 'X',
      argument: 'METHOD',
      type: String,
      deprecated: false,
    },
    {
      name: 'header',
      description: 'Add custom header (can be used multiple times)',
      shorthand: 'H',
      argument: 'HEADER',
      type: String,
      deprecated: false,
    },
    {
      name: 'data',
      description: 'HTTP request body data',
      shorthand: 'd',
      argument: 'DATA',
      type: String,
      deprecated: false,
    },
    {
      name: 'show-body',
      description: 'Show response body in output',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'json-output',
      description: 'Output results in JSON format',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'insecure',
      description: 'Allow insecure HTTPS connections',
      shorthand: 'k',
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
      name: 'cwd',
      description: 'Current working directory to resolve linked project from',
      shorthand: null,
      argument: 'PATH',
      type: String,
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Get timing statistics for the root path',
      value: `${packageName} httpstat /`,
    },
    {
      name: 'Analyze API endpoint with timing breakdown',
      value: `${packageName} httpstat /api/users`,
    },
    {
      name: 'Target production environment',
      value: `${packageName} httpstat /api/status --prod`,
    },
    {
      name: 'Target specific environment',
      value: `${packageName} httpstat /api/data --environment preview`,
    },
    {
      name: 'Use httpstat options',
      value: `${packageName} httpstat /api/status --include --location`,
    },
    {
      name: 'Target project in a specific directory',
      value: `${packageName} httpstat /api/hello --cwd /path/to/project`,
    },
  ],
} as const;
