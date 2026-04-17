import { formatOption } from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

export const createSubcommand = {
  name: 'create',
  aliases: [],
  description: 'Create a new Connex client',
  arguments: [
    {
      name: 'type',
      required: true,
    },
  ],
  options: [
    {
      name: 'name',
      shorthand: 'n',
      type: String,
      argument: 'NAME',
      deprecated: false,
      description: 'Name of the Connex client',
    },
    formatOption,
  ],
  examples: [
    {
      name: 'Create a Slack app',
      value: `${packageName} connex create slack`,
    },
    {
      name: 'Create with a custom name',
      value: `${packageName} connex create slack --name my-bot`,
    },
    {
      name: 'Output as JSON',
      value: `${packageName} connex create slack --format=json`,
    },
  ],
} as const;

export const connexCommand = {
  name: 'connex',
  aliases: [],
  description: 'Manage Vercel Connect clients',
  arguments: [],
  options: [],
  subcommands: [createSubcommand],
  examples: [
    {
      name: 'Create a Slack app',
      value: `${packageName} connex create slack`,
    },
  ],
} as const;
