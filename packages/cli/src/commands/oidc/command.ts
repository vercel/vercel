import { packageName } from '../../util/pkg-name';

export const tokenSubcommand = {
  name: 'token',
  aliases: [],
  description: 'Get the OIDC token for a Vercel project',
  arguments: [],
  options: [
    {
      name: 'json',
      description: 'Output as JSON with expiration time',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'project',
      description: 'Project name or ID (defaults to linked project)',
      shorthand: 'p',
      argument: 'NAME_OR_ID',
      type: String,
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Get OIDC token for the linked project',
      value: `${packageName} oidc token`,
    },
    {
      name: 'Get OIDC token for a specific project',
      value: `${packageName} oidc token --project my-app`,
    },
    {
      name: 'Get OIDC token as JSON (includes expiration)',
      value: `${packageName} oidc token --json`,
    },
    {
      name: 'Use with environment variable',
      value: `export VERCEL_OIDC_TOKEN=$(${packageName} oidc token)`,
    },
  ],
} as const;

export const oidcCommand = {
  name: 'oidc',
  aliases: [],
  description: 'Manage OIDC tokens for Vercel projects',
  arguments: [],
  subcommands: [tokenSubcommand],
  options: [],
  examples: [],
} as const;
