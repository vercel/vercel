export const statusSubcommand = {
  name: 'status',
  aliases: [],
  description: 'Shows whether telemetry collection is enabled or disabled',
  arguments: [],
  options: [],
  examples: [],
} as const;

export const enableSubcommand = {
  name: 'enable',
  aliases: [],
  description: 'Enables telemetry collection',
  arguments: [],
  options: [],
  examples: [],
} as const;

export const flushSubcommand = {
  name: 'flush',
  aliases: [],
  description: 'Internal command to flush telemetry events',
  hidden: true,
  arguments: [],
  options: [],
  examples: [],
} as const;

export const disableSubcommand = {
  name: 'disable',
  aliases: [],
  description: 'Disables telemetry collection',
  arguments: [],
  options: [],
  examples: [],
} as const;

export const telemetryCommand = {
  name: 'telemetry',
  aliases: [],
  description: 'Allows you to enable or disable telemetry collection',
  arguments: [],
  subcommands: [
    enableSubcommand,
    disableSubcommand,
    statusSubcommand,
    flushSubcommand,
  ],
  options: [],
  examples: [],
} as const;
