import { packageName } from '../../util/pkg-name';

export const connectCommand = {
  name: 'connect',
  aliases: [],
  description: 'Connect a third-party service or list existing connections.',
  arguments: [
    {
      name: 'provider-or-subcommand',
      required: false,
      description:
        'Provider to connect (e.g., slack, github) or "list" to show existing connections',
    },
  ],
  options: [
    {
      name: 'mode',
      shorthand: 'm',
      type: String,
      argument: 'MODE',
      description: 'Token mode: bot, user, or app (default: bot)',
      deprecated: false,
    },
    {
      name: 'app-name',
      shorthand: null,
      type: String,
      argument: 'NAME',
      description: 'App or bot display name for the provider',
      deprecated: false,
    },
    {
      name: 'provider',
      shorthand: 'p',
      type: String,
      argument: 'PROVIDER',
      description: 'Filter connections by provider (for list)',
      deprecated: false,
    },
    {
      name: 'no-open',
      shorthand: null,
      type: Boolean,
      description: "Don't automatically open the browser",
      deprecated: false,
    },
    {
      name: 'timeout',
      shorthand: 't',
      type: Number,
      argument: 'SECONDS',
      description: 'Timeout in seconds (default: 300)',
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'List all connections',
      value: `${packageName} connect list`,
    },
    {
      name: 'List Slack connections',
      value: `${packageName} connect list --provider slack`,
    },
    {
      name: 'Connect Slack',
      value: `${packageName} connect slack`,
    },
    {
      name: 'Connect Slack with a custom bot name',
      value: `${packageName} connect slack --app-name "My Bot"`,
    },
    {
      name: 'Get an access token',
      value: `${packageName} connect get-token <token-id>`,
    },
  ],
} as const;
