import { packageName, getCommandName } from '../../util/pkg-name.js';

export const secretsCommand = {
  name: 'secrets',
  description: `NOTE: The ${getCommandName(
    'env'
  )} command is recommended instead of ${getCommandName('secrets')}`,
  arguments: [
    {
      name: 'command',
      required: false,
    },
  ],
  subcommands: [
    {
      name: 'ls',
      description: 'Show all secrets in a list',
      arguments: [],
      options: [],
      examples: [],
    },
    {
      name: 'add',
      description: 'Add a new secret',
      arguments: [
        {
          name: 'name',
          required: true,
        },
        {
          name: 'value',
          required: true,
        },
      ],
      options: [],
      examples: [],
    },
    {
      name: 'rename',
      description: 'Change the name of a secret',
      arguments: [
        {
          name: 'old-name',
          required: true,
        },
        {
          name: 'new-name',
          required: true,
        },
      ],
      options: [],
      examples: [],
    },
    {
      name: 'rm',
      description: 'Remove a secret',
      arguments: [
        {
          name: 'name',
          required: true,
        },
      ],
      options: [],
      examples: [],
    },
  ],
  options: [
    {
      name: 'next',
      description: 'Show next page of results',
      argument: 'MS',
      shorthand: 'n',
      type: 'string',
      deprecated: false,
      multi: false,
    },
  ],
  examples: [
    {
      name: 'Add a new secret',
      value: `${packageName} secrets add my-secret "my value"

      - Once added, a secret's value can't be retrieved in plain text anymore
      - If the secret's value is more than one word, wrap it in quotes
      - When in doubt, always wrap your value in quotes`,
    },
    {
      name: 'Expose a secret as an environment variable (notice the `@` symbol)',
      value: `${packageName} -e MY_SECRET=@my-secret`,
    },
    {
      name: 'Paginate results, where 1584722256178 is the time in milliseconds since the UNIX epoch',
      value: `$ ${packageName} secrets ls --next 1584722256178`,
    },
  ],
};
