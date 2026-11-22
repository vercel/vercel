import { jsonOption } from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'Lists Vercel CLI versions available to install',
  arguments: [],
  options: [jsonOption],
  examples: [],
} as const;

export const installedSubcommand = {
  name: 'installed',
  aliases: [],
  description: 'Lists installed Vercel CLI versions',
  arguments: [],
  options: [],
  examples: [],
} as const;

export const useSubcommand = {
  name: 'use',
  aliases: ['switch', 'install'],
  description: 'Installs and switches to a specific Vercel CLI version',
  arguments: [
    {
      name: 'version',
      required: true,
    },
  ],
  options: [],
  examples: [
    {
      name: 'Use a specific production version',
      value: `${packageName} version use 50.1.0`,
    },
    {
      name: 'Use the latest production version',
      value: `${packageName} version use latest`,
    },
  ],
} as const;

export const checkSubcommand = {
  name: 'check',
  aliases: [],
  description: 'Check for native CLI updates in the background',
  arguments: [],
  options: [],
  examples: [],
} as const;

export const updateSubcommand = {
  name: 'update',
  aliases: ['upgrade'],
  description: 'Updates the Vercel CLI to the latest version',
  arguments: [],
  options: [],
  examples: [],
} as const;

export const autoupdateEnableSubcommand = {
  name: 'enable',
  aliases: [],
  description: 'Turn on automatic CLI updates',
  arguments: [],
  options: [],
  examples: [
    {
      name: 'Turn on automatic updates',
      value: `${packageName} version autoupdate enable`,
    },
  ],
} as const;

export const autoupdateDisableSubcommand = {
  name: 'disable',
  aliases: [],
  description: 'Turn off automatic CLI updates',
  arguments: [],
  options: [],
  examples: [
    {
      name: 'Turn off automatic updates',
      value: `${packageName} version autoupdate disable`,
    },
  ],
} as const;

export const autoupdateStatusSubcommand = {
  name: 'status',
  aliases: [],
  default: true,
  description: 'Show whether automatic CLI updates are on',
  arguments: [],
  options: [],
  examples: [
    {
      name: 'Show whether automatic updates are on',
      value: `${packageName} version autoupdate status`,
    },
  ],
} as const;

export const autoupdateSubcommand = {
  name: 'autoupdate',
  aliases: [],
  description: 'Enables or disables automatic CLI updates',
  arguments: [],
  subcommands: [
    autoupdateEnableSubcommand,
    autoupdateDisableSubcommand,
    autoupdateStatusSubcommand,
  ],
  options: [],
  examples: [
    {
      name: 'Enable automatic updates',
      value: `${packageName} version autoupdate enable`,
    },
    {
      name: 'Show whether automatic updates are enabled',
      value: `${packageName} version autoupdate status`,
    },
  ],
} as const;

export const versionCommand = {
  name: 'version',
  aliases: ['versions'],
  description: 'Manages the installed Vercel CLI version.',
  runsWithoutSubcommand: true,
  arguments: [],
  subcommands: [
    listSubcommand,
    installedSubcommand,
    useSubcommand,
    updateSubcommand,
    checkSubcommand,
    autoupdateSubcommand,
  ],
  options: [],
  examples: [
    {
      name: 'Show the current version and install details',
      value: `${packageName} version`,
    },
    {
      name: 'List installed versions',
      value: `${packageName} version installed`,
    },
    {
      name: 'Use a specific version',
      value: `${packageName} version use 50.1.0`,
    },
  ],
} as const;
