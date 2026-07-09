import { packageName } from '../../../util/pkg-name';
import { createSubcommand } from '../create/command';
import { execSubcommand } from '../exec/command';

export const runSubcommand = {
  name: 'run',
  aliases: [],
  description: 'Run a command in a sandbox, creating it first if necessary.',
  arguments: [
    {
      name: 'command',
      required: true,
    },
    {
      name: 'args',
      required: false,
      multiple: true,
    },
  ],
  options: [
    ...createSubcommand.options.filter(
      option => option.name !== 'env' && option.name !== 'project'
    ),
    ...execSubcommand.options.filter(option => option.name !== 'timeout'),
    {
      name: 'rm',
      shorthand: null,
      type: Boolean,
      description: 'Remove the sandbox after the command finishes.',
      deprecated: false,
    },
    {
      name: 'stop',
      shorthand: null,
      type: Boolean,
      description: 'Stop the sandbox after the command finishes.',
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Run a command in a new sandbox, removing it afterward',
      value: `${packageName} sandbox run --rm -- npm test`,
    },
    {
      name: "Run a command in an existing sandbox, creating it if it doesn't exist",
      value: `${packageName} sandbox run --name my-sandbox -- npm run build`,
    },
    {
      name: 'Create a sandbox with no network access, run a script, then stop it',
      value: `${packageName} sandbox run --network-policy=deny-all --stop -- ./ci.sh`,
    },
  ],
} as const;
