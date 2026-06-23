import { packageName } from '../../util/pkg-name';
import {
  forceOption,
  formatOption,
  limitOption,
  nextOption,
  projectOption,
  yesOption,
} from '../../util/arg-common';

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'Show all domains in a list',
  default: true,
  arguments: [],
  options: [limitOption, nextOption, formatOption],
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

export const priceSubcommand = {
  name: 'price',
  aliases: [],
  description: 'Show registrar price quotes for one or more domains',
  arguments: [
    {
      name: 'domain',
      required: true,
      multiple: true,
    },
  ],
  options: [formatOption],
  examples: [
    {
      name: 'Price quote for a domain',
      value: `${packageName} domains price example.com`,
    },
    {
      name: 'Price quotes for multiple domains',
      value: `${packageName} domains price one.com two.com three.com`,
    },
    {
      name: 'JSON output',
      value: `${packageName} domains price example.com --format json`,
    },
  ],
} as const;

export const searchSubcommand = {
  name: 'search',
  aliases: [],
  description: 'Discover domain-name candidates from a keyword or fragment',
  arguments: [
    {
      name: 'query',
      required: true,
    },
  ],
  options: [
    {
      name: 'available',
      shorthand: null,
      type: Boolean,
      description: 'Show only candidates available to register',
      deprecated: false,
    },
    {
      name: 'order',
      shorthand: null,
      type: String,
      argument: 'ORDER',
      description:
        'Order candidates by relevance, alphabetical order, or length (default: relevance)',
      deprecated: false,
    },
    {
      name: 'limit',
      shorthand: null,
      type: Number,
      argument: 'NUMBER',
      description:
        'Number of candidates to check per page (default: 20, max: 200)',
      deprecated: false,
    },
    {
      name: 'tld',
      shorthand: null,
      type: [String],
      argument: 'TLD',
      description: 'Filter candidates by exact TLD. Repeatable.',
      deprecated: false,
    },
    {
      name: 'next',
      shorthand: null,
      type: String,
      argument: 'CURSOR',
      description: 'Show the next page of candidates',
      deprecated: false,
    },
    formatOption,
  ],
  examples: [
    {
      name: 'Discover domain-name candidates',
      value: `${packageName} domains search acme`,
    },
    {
      name: 'Narrow candidates with a TLD fragment',
      value: `${packageName} domains search acme.d`,
    },
    {
      name: 'Filter candidates by TLD',
      value: `${packageName} domains search acme --tld com --tld dev`,
    },
    {
      name: 'Show only available candidates',
      value: `${packageName} domains search acme --available`,
    },
    {
      name: 'JSON output',
      value: `${packageName} domains search acme --format=json`,
    },
  ],
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

export const checkSubcommand = {
  name: 'check',
  aliases: [],
  description: 'Check if a domain is available to buy',
  arguments: [
    {
      name: 'domain',
      required: true,
      multiple: true,
    },
  ],
  options: [formatOption],
  examples: [
    {
      name: 'Check if a domain is available',
      value: `${packageName} domains check example.com`,
    },
    {
      name: 'Check availability for multiple domains',
      value: `${packageName} domains check one.com two.com three.com`,
    },
    {
      name: 'JSON output',
      value: `${packageName} domains check example.com --format json`,
    },
  ],
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

export const verifySubcommand = {
  name: 'verify',
  aliases: [],
  description:
    "Check a domain's DNS configuration and explain what to fix when it is misconfigured or unverified",
  arguments: [
    {
      name: 'domain',
      required: true,
    },
  ],
  options: [
    projectOption,
    {
      name: 'strict',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Check DNS for the exact domain only, without falling back to the parent zone configuration',
    },
    formatOption,
  ],
  examples: [
    {
      name: 'Check why a domain is not working',
      value: `${packageName} domains verify example.com`,
    },
    {
      name: 'Check a domain against a specific project',
      value: `${packageName} domains verify example.com --project my-site`,
    },
    {
      name: 'JSON output (the exit code is non-zero when the domain is misconfigured or unverified)',
      value: `${packageName} domains verify example.com --format json`,
    },
    {
      name: 'Agent-friendly output with status, reason, and suggested next commands',
      value: `${packageName} domains verify example.com --non-interactive`,
    },
  ],
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
    checkSubcommand,
    moveSubcommand,
    priceSubcommand,
    searchSubcommand,
    transferInSubcommand,
    removeSubcommand,
    verifySubcommand,
  ],
  options: [],
  examples: [],
} as const;
