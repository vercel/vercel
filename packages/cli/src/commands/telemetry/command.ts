export const telemetryCommand = {
  name: 'telemetry',
  description: 'Allows you to enable or disable telemetry collection.',
  arguments: [
    {
      name: 'command',
      required: false,
    },
  ],
  subcommands: [
    {
      name: 'status',
      description: 'Shows whether telemetry collection is enabled or disabled',
      arguments: [],
      options: [],
      examples: [],
    },
    {
      name: 'enable',
      description: 'Enables telemetry collection',
      arguments: [],
      options: [],
      examples: [],
    },
    {
      name: 'disable',
      description: 'Disables telemetry collection',
      arguments: [],
      options: [],
      examples: [],
    },
  ],
  options: [],
  examples: [],
} as const;
