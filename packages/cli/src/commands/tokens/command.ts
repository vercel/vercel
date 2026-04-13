import { packageName } from '../../util/pkg-name';
import { formatOption } from '../../util/arg-common';

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List your personal authentication tokens',
  default: true,
  arguments: [],
  options: [
    formatOption,
    {
      name: 'limit',
      shorthand: null,
      type: Number,
      description: 'Maximum number of tokens to return (default 20)',
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'List tokens as JSON',
      value: `${packageName} tokens ls --format json`,
    },
  ],
} as const;

export const addSubcommand = {
  name: 'add',
  aliases: ['create'],
  description: 'Create a new personal authentication token',
  arguments: [
    {
      name: 'name',
      required: true,
    },
  ],
  options: [
    formatOption,
    {
      name: 'project',
      shorthand: null,
      type: String,
      description: 'Optional project ID to scope the token to',
      deprecated: false,
    },
    {
      name: 'permission',
      shorthand: null,
      type: [String],
      deprecated: false,
      description:
        'Permission in resource:action format (repeatable). Constrains the token to only these permissions. Valid actions: create, delete, read, update, list. Requires --expiry (max 7 days).',
    },
    {
      name: 'expiry',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Token lifetime as a duration (e.g. "7d", "1h", "30m"). Required when --permission is used. Max 7 days.',
      argument: 'DURATION',
    },
  ],
  examples: [
    {
      name: 'Create a token',
      value: `${packageName} tokens add "CI deploy"`,
    },
    {
      name: 'Create a scoped token',
      value: `${packageName} tokens add "CI deploy" --permission deployment:create --permission project:read --expiry 7d`,
    },
  ],
} as const;

export const removeSubcommand = {
  name: 'remove',
  aliases: ['rm', 'delete'],
  description: 'Delete a personal authentication token by ID',
  arguments: [
    {
      name: 'id',
      required: true,
    },
  ],
  options: [formatOption],
  examples: [
    {
      name: 'Remove a token',
      value: `${packageName} tokens rm tok_abc123`,
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
