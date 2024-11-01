export const statusSubcommand = {
  name: 'status',
  description: 'Shows whether telemetry collection is enabled or disabled',
  arguments: [],
  options: [],
  examples: [],
} as const;

export const enableSubcommand = {
  name: 'enable',
  description: 'Enables telemetry collection',
  arguments: [],
  options: [],
  examples: [],
} as const;

export const disableSubcommand = {
  name: 'disable',
  description: 'Disables telemetry collection',
  arguments: [],
  options: [],
  examples: [],
} as const;

export const telemetryCommand = {
  name: 'telemetry',
  description: 'Allows you to enable or disable telemetry collection',
  arguments: [],
  subcommands: [enableSubcommand, disableSubcommand, statusSubcommand],
  options: [],
  examples: [],
} as const;
