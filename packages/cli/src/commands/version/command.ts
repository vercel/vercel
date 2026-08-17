import { packageName } from '../../util/pkg-name';

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'Lists Vercel CLI versions available to install',
  arguments: [],
  options: [],
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
      name: 'Use a specific version (pins it)',
      value: `${packageName} version use 50.1.0`,
    },
    {
      name: 'Return to the latest version (unpins)',
      value: `${packageName} version use latest`,
    },
  ],
} as const;

export const updateSubcommand = {
  name: 'update',
  aliases: ['upgrade'],
  description: 'Updates the Vercel CLI to the latest version',
  arguments: [],
  options: [],
  examples: [],
} as const;

export const autoupdateSubcommand = {
  name: 'autoupdate',
  aliases: [],
  description: 'Enables or disables automatic CLI updates',
  arguments: [
    {
      name: 'enable|disable|status',
      required: false,
    },
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
  arguments: [],
  subcommands: [
    listSubcommand,
    installedSubcommand,
    useSubcommand,
    updateSubcommand,
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
