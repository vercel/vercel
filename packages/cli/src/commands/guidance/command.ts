export const statusSubcommand = {
  name: 'status',
  aliases: [],
  description: 'Shows whether guidance messages are enabled or disabled',
  arguments: [],
  options: [],
  examples: [],
} as const;

export const enableSubcommand = {
  name: 'enable',
  aliases: [],
  description: 'Enables guidance messages',
  arguments: [],
  options: [],
  examples: [],
} as const;

export const disableSubcommand = {
  name: 'disable',
  aliases: [],
  description: 'Disables guidance messages',
  arguments: [],
  options: [],
  examples: [],
} as const;

export const guidanceCommand = {
  name: 'guidance',
  aliases: [],
  description: 'Allows you to enable or disable guidance messages',
  arguments: [],
  subcommands: [enableSubcommand, disableSubcommand, statusSubcommand],
  options: [],
  examples: [],
} as const;
