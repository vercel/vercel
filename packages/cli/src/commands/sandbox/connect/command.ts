import { projectOption } from '../../../util/arg-common';
import { packageName } from '../../../util/pkg-name';

export const connectSubcommand = {
  name: 'connect',
  aliases: ['ssh', 'shell'],
  description: 'Start an interactive shell in an existing sandbox',
  arguments: [
    {
      name: 'name',
      required: true,
    },
  ],
  options: [
    {
      name: 'sudo',
      shorthand: null,
      type: Boolean,
      description: 'Give extended privileges to the command.',
      deprecated: false,
    },
    {
      name: 'no-extend-timeout',
      shorthand: null,
      type: Boolean,
      description:
        'Do not extend the sandbox timeout while running an interactive command. Only affects interactive executions.',
      deprecated: false,
    },
    {
      name: 'workdir',
      shorthand: 'w',
      type: String,
      argument: 'DIR',
      description: 'The working directory to run the command in',
      deprecated: false,
    },
    {
      name: 'env',
      shorthand: 'e',
      type: [String],
      argument: 'KEY=VALUE',
      description: 'Environment variables to set for the command',
      deprecated: false,
    },
    {
      name: 'timeout',
      shorthand: null,
      type: String,
      argument: 'DURATION',
      description:
        'Maximum duration to wait for the command (e.g. 30s, 5m). On expiry the process is killed with SIGKILL. Cannot be combined with --interactive.',
      deprecated: false,
    },
    projectOption,
  ],
  examples: [
    {
      name: 'Start an interactive shell in a sandbox',
      value: `${packageName} sandbox connect my-sandbox`,
    },
    {
      name: 'Connect as root with a custom working directory',
      value: `${packageName} sandbox connect my-sandbox --sudo --workdir /app`,
    },
  ],
} as const;
