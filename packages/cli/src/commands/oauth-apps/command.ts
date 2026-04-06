import { formatOption, yesOption } from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

export const listRequestsSubcommand = {
  name: 'list-requests',
  aliases: ['requests'],
  description:
    'List pending Vercel App (OAuth) installation requests for the team',
  arguments: [],
  options: [formatOption],
  examples: [
    {
      name: 'List pending installation requests',
      value: `${packageName} oauth-apps list-requests`,
    },
    {
      name: 'JSON output',
      value: `${packageName} oauth-apps list-requests --format json`,
    },
  ],
} as const;

export const dismissSubcommand = {
  name: 'dismiss',
  aliases: [],
  description: 'Dismiss a pending app installation request by client ID',
  arguments: [
    {
      name: 'appId',
      required: true,
    },
  ],
  options: [formatOption, yesOption],
  examples: [
    {
      name: 'Dismiss a request',
      value: `${packageName} oauth-apps dismiss cl_abc123 --yes`,
    },
  ],
} as const;

export const installSubcommand = {
  name: 'install',
  aliases: ['add'],
  description: 'Install a Vercel App to the team using its OAuth client ID',
  arguments: [],
  options: [
    {
      name: 'client-id',
      shorthand: null,
      type: String,
      argument: 'ID',
      deprecated: false,
      description: 'OAuth client ID of the Vercel App (required)',
    },
    {
      name: 'permission',
      shorthand: null,
      type: [String],
      argument: 'SCOPE',
      deprecated: false,
      description:
        'Permission to grant (repeatable). Example: --permission read:project',
    },
    {
      name: 'projects',
      shorthand: null,
      type: String,
      argument: 'IDS',
      deprecated: false,
      description:
        'Comma-separated project IDs, or * for all projects (optional)',
    },
    formatOption,
  ],
  examples: [
    {
      name: 'Install with permissions',
      value: `${packageName} oauth-apps install --client-id cl_abc --permission read:project --permission read:deployment`,
    },
  ],
} as const;

export const removeSubcommand = {
  name: 'remove',
  aliases: ['rm', 'uninstall'],
  description: 'Uninstall a Vercel App from the team',
  arguments: [
    {
      name: 'installationId',
      required: true,
    },
  ],
  options: [formatOption, yesOption],
  examples: [
    {
      name: 'Uninstall',
      value: `${packageName} oauth-apps remove inst_abc123 --yes`,
    },
  ],
} as const;

export const oauthAppsCommand = {
  name: 'oauth-apps',
  aliases: [],
  description: 'Manage Vercel App (OAuth) installations for your team',
  arguments: [],
  subcommands: [
    listRequestsSubcommand,
    dismissSubcommand,
    installSubcommand,
    removeSubcommand,
  ],
  options: [],
  examples: [],
} as const;
