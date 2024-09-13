import { packageName } from '../../util/pkg-name';
import {
  forceOption,
  limitOption,
  nextOption,
  yesOption,
} from '../../util/arg-common';

const listSubcommand = {
  name: 'ls',
  description: 'Show all domains in a list',
  arguments: [],
  options: [
    {
      ...nextOption,
      description: 'Show next page of results',
    },
    {
      ...limitOption,
      description:
        'Number of results to return per page (default: 20, max: 100)',
      argument: 'NUMBER',
    },
  ],
  examples: [],
} as const;

const inspectSubcommand = {
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
} as const;

const addSubcommand = {
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
  options: [
    {
      ...forceOption,
      shorthand: null,
      description:
        'Force a domain on a project and remove it from an existing one',
    },
  ],
  examples: [],
} as const;

const removeSubcommand = {
  name: 'rm',
  description: 'Remove a domain',
  arguments: [
    {
      name: 'name',
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

const moveSubcommand = {
  name: 'move',
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
  options: [
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when removing a domain',
    },
  ],
  examples: [],
} as const;

const transferInSubcommand = {
  name: 'transfer-in',
  description: 'Transfer in a domain to Vercel',
  arguments: [
    {
      name: 'name',
      required: true,
    },
  ],
  options: [{ name: 'code', shorthand: null, type: String, deprecated: false }],
  examples: [],
} as const;

const buySubcommand = {
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
} as const;

export const domainsCommand = {
  name: 'domains',
  description: 'Manage domains',
  arguments: [
    {
      name: 'command',
      required: true,
    },
  ],
  subcommands: [
    listSubcommand,
    inspectSubcommand,
    addSubcommand,
    removeSubcommand,
    buySubcommand,
    moveSubcommand,
    transferInSubcommand,
  ],
  options: [],
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
