import { packageName } from '../../util/pkg-name';
import {
  forceOption,
  limitOption,
  nextOption,
  yesOption,
} from '../../util/arg-common';

export const domainsCommand = {
  name: 'domains',
  aliases: ['domain'],
  description: 'Manage domains',
  arguments: [],
  subcommands: [
    {
      name: 'ls',
      aliases: ['list'],
      description: 'Show all domains in a list',
      default: true,
      arguments: [],
      options: [],
      examples: [],
    },
    {
      name: 'inspect',
      aliases: [],
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
      aliases: [],
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
      aliases: ['remove'],
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
      aliases: [],
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
      aliases: [],
      description: 'Move a domain to another scope',
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
      aliases: [],
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
      ...yesOption,
      description: 'Skip the confirmation prompt when removing a domain',
    },
    limitOption,
    nextOption,
    {
      ...forceOption,
      shorthand: null,
      description:
        'Force a domain on a project and remove it from an existing one',
    },
    { name: 'code', shorthand: null, type: String, deprecated: false },
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
} as const;
