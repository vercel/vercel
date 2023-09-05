import { Command } from '../help';
import { packageName } from '../../util/pkg-name';

export const domainsCommand: Command = {
  name: 'domains',
  description: 'Manage domains',
  arguments: [
    {
      name: 'command',
      required: true,
    },
  ],
  subcommands: [
    {
      name: 'ls',
      description: 'Show all domains in a list',
      arguments: [],
      options: [],
      examples: [],
    },
    {
      name: 'inspect',
      description: 'Displays information related to a domain',
      arguments: [
        {
          name: 'name',
          required: true,
        },
      ],
      options: [],
      examples: [],
    },
    {
      name: 'add',
      description: 'Add a new domain that you already own',
      arguments: [
        {
          name: 'name',
          required: true,
        },
        {
          name: 'project',
          required: true,
        },
      ],
      options: [],
      examples: [],
    },
    {
      name: 'rm',
      description: 'Remove a domain',
      arguments: [
        {
          name: 'name',
          required: true,
        },
      ],
      options: [],
      examples: [],
    },
    {
      name: 'buy',
      description: "Buy a domain that you don't yet own",
      arguments: [
        {
          name: 'name',
          required: true,
        },
      ],
      options: [],
      examples: [],
    },
    {
      name: 'move',
      description: 'Move a domain to another user or team',
      arguments: [
        {
          name: 'name',
          required: true,
        },
        {
          name: 'destination',
          required: true,
        },
      ],
      options: [],
      examples: [],
    },
    {
      name: 'transfer-in',
      description: 'Transfer in a domain to Vercel',
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
      shorthand: 'N',
      type: 'string',
      deprecated: false,
      multi: false,
    },
    {
      name: 'yes',
      description: 'Skip the confirmation prompt when removing a domain',
      shorthand: 'y',
      type: 'boolean',
      deprecated: false,
      multi: false,
    },
    {
      name: 'limit',
      shorthand: 'n',
      description:
        'Number of results to return per page (default: 20, max: 100)',
      argument: 'NUMBER',
      type: 'string',
      deprecated: false,
      multi: false,
    },
    {
      name: 'force',
      shorthand: 'f',
      type: 'boolean',
      deprecated: false,
      description:
        'Force a domain on a project and remove it from an existing one',
      multi: false,
    },
  ],
  examples: [
    {
      name: 'Add a domain that you already own',
      value: [
        `${packageName} domains add domain-name.com`,
        "Make sure the domain's DNS nameservers are at least 2 of the ones listed on https://vercel.com/edge-network",
        `NOTE: Running ${packageName} alias will automatically register your domain if it's configured with these nameservers (no need to 'domains add')`,
      ],
    },
    {
      name: 'Paginate results, where `1584722256178` is the time in milliseconds since the UNIX epoch',
      value: `${packageName} domains ls--next 1584722256178`,
    },
  ],
};
