export const preinstallSubcommand = {
  name: 'preinstall',
  aliases: [],
  description: 'Preinstall and load native Builders.',
  arguments: [],
  options: [],
  examples: [],
} as const;

export const buildersCommand = {
  name: 'builders',
  aliases: [],
  description: 'Manage the native Builder cache.',
  hidden: true,
  arguments: [],
  subcommands: [preinstallSubcommand],
  options: [],
  examples: [],
} as const;
