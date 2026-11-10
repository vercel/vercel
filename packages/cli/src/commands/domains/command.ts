import { packageName } from '../../util/pkg-name';
import {
  forceOption,
  formatOption,
  jsonOption,
  limitOption,
  nextCursorOption,
  projectOption,
  yesOption,
} from '../../util/arg-common';

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'Show all domains in a list',
  default: true,
  arguments: [],
  options: [limitOption, nextCursorOption, formatOption, jsonOption],
  examples: [
    {
      name: 'Show the next page, using the cursor from the previous output',
      placeholders: ['<CURSOR>'],
      value: `${packageName} domains list --next <CURSOR>`,
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
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'JSON output',
      value: `${packageName} domains inspect example.com --json`,
    },
  ],
} as const;

export const addSubcommand = {
  name: 'add',
  aliases: [],
  description: 'Add a domain you already own to your team or a project',
  arguments: [
    {
      name: 'domain',
      required: true,
      description: 'Domain name, such as example.com',
    },
    {
      name: 'project',
      required: false,
      description:
        'Optional project name; omit to add an apex domain to the team',
    },
  ],
  options: [
    {
      ...forceOption,
      shorthand: null,
      description:
        'Remove the current assignment, then add the domain to the requested project (a failed add can leave it unassigned)',
    },
  ],
  examples: [
    {
      name: 'Add a domain that you already own',
      value: [`${packageName} domains add domain-name.com`],
    },
  ],
  helpSections: [
    {
      title: 'DNS Configuration',
      body: [
        "Without a project, adds an apex domain to your team and creates its DNS zone. To use Vercel DNS, configure the domain's nameservers at your registrar.",
        "With a project, assigns the domain to it. External DNS providers are supported; follow the project's DNS configuration instructions.",
        '`vercel alias` can add an existing domain to your team while assigning it to a deployment, so a separate `domains add` step may not be needed.',
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
  options: [formatOption, jsonOption],
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
      value: `${packageName} domains price example.com --json`,
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
      shorthand: 'n',
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
    jsonOption,
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
      value: `${packageName} domains search acme --json`,
    },
  ],
} as const;

const amountOption = {
  name: 'amount',
  shorthand: null,
  type: String,
  argument: 'USD',
  deprecated: false,
  description:
    'Price a person approved for this charge, in USD. Required without a terminal; nothing is charged if the price changed',
} as const;

const contactOption = <Name extends string>(name: Name, description: string) =>
  ({
    name,
    shorthand: null,
    type: String,
    argument: 'TEXT',
    deprecated: false,
    description,
  }) as const;

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
  options: [
    amountOption,
    {
      name: 'use-billing-details',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      rejectsValue: true,
      description:
        "Fill registrant details you don't pass from the team's billing info (email and address). An address option that replaces a billing value skips the whole billing address",
    },
    contactOption('first-name', 'Registrant first name'),
    contactOption('last-name', 'Registrant last name'),
    contactOption('email', 'Registrant email'),
    contactOption(
      'phone',
      'Registrant phone with country code, such as +11122233344'
    ),
    contactOption('address', 'Registrant street address'),
    contactOption('city', 'Registrant city'),
    contactOption('state', 'Registrant state or province'),
    contactOption('zip', 'Registrant postal or ZIP code'),
    contactOption('country', 'Registrant 2-letter country code, such as US'),
    contactOption('company', 'Registrant company name (optional)'),
    {
      name: 'auto-renew',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      rejectsValue: true,
      description:
        'Renew the domain automatically at the end of each term. Without a terminal, pass --auto-renew or --no-auto-renew',
    },
    {
      name: 'no-auto-renew',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      rejectsValue: true,
      description: "Don't renew the domain automatically",
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Buy a domain (shows the price and asks for contact details)',
      value: `${packageName} domains buy example.com`,
    },
    {
      name: 'From an agent or script: buy at the price a person approved, with the billing info for the address',
      value: `${packageName} domains buy example.com --scope my-team --amount 20.00 --use-billing-details --first-name Jane --last-name Doe --phone +11122233344 --no-auto-renew`,
    },
  ],
} as const;

export const checkSubcommand = {
  name: 'check',
  aliases: [],
  description: 'Check whether one or more domains are available to buy',
  arguments: [
    {
      name: 'domain',
      required: true,
      multiple: true,
    },
  ],
  options: [formatOption, jsonOption],
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
      value: `${packageName} domains check example.com --json`,
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

export const autoRenewEnableSubcommand = {
  name: 'enable',
  aliases: [],
  description: 'Turn on automatic renewal for a registered domain',
  arguments: [
    {
      name: 'domain',
      required: true,
    },
  ],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Turn on automatic renewal',
      value: `${packageName} domains auto-renew enable example.com`,
    },
    {
      name: 'Turn on automatic renewal and print the result as JSON',
      value: `${packageName} domains auto-renew enable example.com --json`,
    },
  ],
} as const;

export const autoRenewDisableSubcommand = {
  name: 'disable',
  aliases: [],
  description: 'Turn off automatic renewal for a registered domain',
  arguments: [
    {
      name: 'domain',
      required: true,
    },
  ],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Turn off automatic renewal',
      value: `${packageName} domains auto-renew disable example.com`,
    },
  ],
} as const;

export const autoRenewSubcommand = {
  name: 'auto-renew',
  aliases: [],
  description: 'Turn automatic renewal on or off for a registered domain',
  arguments: [],
  subcommands: [autoRenewEnableSubcommand, autoRenewDisableSubcommand],
  // The old `auto-renew <domain> <on|off>` form reads these too.
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Turn on automatic renewal',
      value: `${packageName} domains auto-renew enable example.com`,
    },
    {
      name: 'Turn off automatic renewal',
      value: `${packageName} domains auto-renew disable example.com`,
    },
    {
      name: 'JSON output',
      value: `${packageName} domains auto-renew enable example.com --json`,
    },
  ],
} as const;

export const renewSubcommand = {
  descriptionTone: 'normal',
  name: 'renew',
  aliases: [],
  description:
    'Renew a registered domain before it expires (charges your account)',
  arguments: [
    {
      name: 'domain',
      required: true,
    },
  ],
  options: [amountOption, formatOption, jsonOption],
  examples: [
    {
      name: 'Renew a domain (shows the renewal price and asks to confirm)',
      value: `${packageName} domains renew example.com`,
    },
    {
      name: 'Renew at an approved price without prompting, and print the result as JSON',
      value: `${packageName} domains renew example.com --scope my-team --amount 20.00 --json`,
    },
  ],
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
    jsonOption,
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
      value: `${packageName} domains verify example.com --json`,
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
    renewSubcommand,
    autoRenewSubcommand,
    verifySubcommand,
  ],
  options: [],
  examples: [
    {
      name: 'Renew a registered domain before it expires',
      placeholders: ['<DOMAIN>'],
      value: `${packageName} domains renew <DOMAIN>`,
    },
    {
      name: 'Turn on automatic renewal for a registered domain',
      placeholders: ['<DOMAIN>'],
      value: `${packageName} domains auto-renew enable <DOMAIN>`,
    },
  ],
} as const;
