export const daemonCommand = {
  name: 'daemon',
  description: 'Manage the Vercel token refresh daemon',
  arguments: [
    {
      name: 'subcommand',
      required: false,
    },
  ],
  subcommands: [
    {
      name: 'install',
      description: 'Install the daemon as an OS service',
      options: [
        {
          name: 'auto-start',
          description: 'Enable automatic start on system boot',
          type: Boolean,
          default: true,
        },
      ],
      arguments: [],
    },
    {
      name: 'uninstall',
      description: 'Uninstall the daemon OS service',
      options: [],
      arguments: [],
    },
    {
      name: 'start',
      description: 'Start the daemon manually',
      options: [
        {
          name: 'foreground',
          description: 'Run in foreground for debugging',
          type: Boolean,
          default: false,
        },
      ],
      arguments: [],
    },
    {
      name: 'stop',
      description: 'Stop the running daemon',
      options: [],
      arguments: [],
    },
    {
      name: 'status',
      description: 'Show daemon status',
      options: [
        {
          name: 'json',
          description: 'Output status as JSON',
          type: Boolean,
          default: false,
        },
      ],
      arguments: [],
    },
    {
      name: 'logs',
      description: 'View daemon logs',
      options: [
        {
          name: 'follow',
          shorthand: 'f',
          description: 'Follow log output',
          type: Boolean,
          default: false,
        },
        {
          name: 'lines',
          shorthand: 'n',
          description: 'Number of lines to show',
          type: String,
          default: '50',
        },
      ],
      arguments: [],
    },
  ],
  options: [],
  examples: [],
};
