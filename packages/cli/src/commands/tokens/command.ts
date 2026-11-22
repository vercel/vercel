import { packageName } from '../../util/pkg-name';
import {
  formatOption,
  jsonOption,
  projectOption,
  yesOption,
} from '../../util/arg-common';

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List your personal authentication tokens',
  default: true,
  arguments: [],
  options: [
    formatOption,
    jsonOption,
    {
      name: 'limit',
      shorthand: 'n',
      type: Number,
      description: 'Maximum number of tokens to return (default: 20, max: 100)',
      deprecated: false,
    },
    {
      name: 'next',
      shorthand: null,
      type: String,
      description:
        'Show the next page using the cursor from the previous output',
      argument: 'CURSOR',
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'List tokens as JSON',
      value: `${packageName} tokens list --json`,
    },
  ],
} as const;

export const addSubcommand = {
  name: 'create',
  aliases: ['add'],
  description: 'Create a new personal authentication token',
  arguments: [
    {
      name: 'name',
      required: true,
    },
  ],
  options: [
    formatOption,
    jsonOption,
    {
      ...projectOption,
      description: 'Optional project ID to scope the token to',
    },
  ],
  examples: [
    {
      name: 'Create a token',
      value: `${packageName} tokens create "CI deploy"`,
    },
  ],
} as const;

export const removeSubcommand = {
  name: 'revoke',
  aliases: ['remove', 'rm', 'delete'],
  description: 'Revoke a personal authentication token by ID',
  arguments: [
    {
      name: 'id',
      required: true,
    },
  ],
  options: [
    formatOption,
    jsonOption,
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when revoking a token',
    },
  ],
  examples: [
    {
      name: 'Revoke a token',
      value: `${packageName} tokens revoke tok_abc123`,
    },
  ],
} as const;

export const tokensCommand = {
  name: 'tokens',
  aliases: [],
  description: 'Manage your personal Vercel authentication tokens',
  arguments: [],
  subcommands: [addSubcommand, listSubcommand, removeSubcommand],
  options: [],
  examples: [],
} as const;
