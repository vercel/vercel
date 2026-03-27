import { packageName } from '../../util/pkg-name';

export const connectCommand = {
  name: 'connect',
  aliases: [],
  description:
    'Connect a third-party service (e.g., Slack) to your project via Vercel STS.',
  arguments: [
    {
      name: 'provider',
      required: true,
      description: 'The provider to connect (e.g., slack, github)',
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
      name: 'Connect Slack to your project',
      value: `${packageName} connect slack`,
    },
    {
      name: 'Connect Slack with a custom bot name',
      value: `${packageName} connect slack --app-name "My Bot"`,
    },
    {
      name: 'Connect Slack as a user token',
      value: `${packageName} connect slack --mode user`,
    },
  ],
} as const;
