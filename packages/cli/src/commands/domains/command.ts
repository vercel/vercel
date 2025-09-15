import { packageName } from '../../util/pkg-name';
import {
  forceOption,
  limitOption,
  nextOption,
  yesOption,
} from '../../util/arg-common';

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'Show all domains in a list',
  default: true,
  arguments: [],
  options: [limitOption, nextOption],
  examples: [
    {
      name: 'Paginate results, where `1584722256178` is the time in milliseconds since the UNIX epoch',
      value: `${packageName} domains ls --next 1584722256178`,
    },
  ],
} as const;

export const inspectSubcommand = {
  name: 'inspect',
  aliases: [],
  description: 'Displays information related to a domain',
  arguments: [
    {
      name: 'domain',
      required: true,
    },
  ],
  options: [],
  examples: [],
} as const;

export const addSubcommand = {
  name: 'add',
  aliases: [],
  description: 'Add a domain name that you already own to a Vercel Team',
  arguments: [
    {
      name: 'domain',
      required: true,
    },
    {
      name: 'project',
      required: true,
    },
  ],
  options: [
    {
      ...forceOption,
      shorthand: null,
      description:
        'Force a domain name for a project and remove it from an existing one',
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
  ],
} as const;

export const removeSubcommand = {
  name: 'remove',
  aliases: ['rm'],
  description: 'Remove ownership of a domain name from a Vercel Team',
  arguments: [
    {
      name: 'domain',
      required: true,
    },
  ],
  options: [
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when removing a domain',
    },
  ],
  examples: [],
} as const;

export const buySubcommand = {
  name: 'buy',
  aliases: [],
  description: 'Purchase a new domain name',
  arguments: [
    {
      name: 'domain',
      required: true,
    },
  ],
  options: [],
  examples: [],
} as const;

export const moveSubcommand = {
  name: 'move',
  aliases: [],
  description: 'Move ownership of a domain name to another Vercel Team',
  arguments: [
    {
      name: 'domain',
      required: true,
    },
    {
      name: 'destination',
      required: true,
    },
  ],
  options: [
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when moving a domain',
    },
  ],
  examples: [],
} as const;

export const transferInSubcommand = {
  name: 'transfer-in',
  aliases: [],
  description: 'Transfer in a domain name to Vercel',
  arguments: [
    {
      name: 'domain',
      required: true,
    },
  ],
  options: [
    {
      name: 'code',
      argument: 'CODE',
      shorthand: null,
      type: String,
      deprecated: false,
    },
  ],
  examples: [],
} as const;

export const domainsCommand = {
  name: 'domains',
  aliases: ['domain'],
  description: 'Manage domains',
  arguments: [],
  subcommands: [
    listSubcommand,
    inspectSubcommand,
    addSubcommand,
    buySubcommand,
    moveSubcommand,
    transferInSubcommand,
    removeSubcommand,
  ],
  options: [],
  examples: [],
} as const;
