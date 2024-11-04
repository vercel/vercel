import { packageName } from '../../util/pkg-name';
import { limitOption, nextOption } from '../../util/arg-common';

export const importSubcommand = {
  name: 'import',
  aliases: [],
  description: 'Import a DNS zone file (see below for examples)',
  arguments: [
    {
      name: 'domain',
      required: true,
    },
    {
      name: 'zonefile',
      required: true,
    },
  ],
  options: [],
  examples: [],
} as const;

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List all DNS entries for a domain',
  default: true,
  arguments: [
    {
      name: 'domain',
      required: true,
    },
  ],
  options: [limitOption, nextOption],
  examples: [],
} as const;

export const addSubcommand = {
  name: 'add',
  aliases: [],
  description: 'Add a new DNS entry (see below for examples)',
  arguments: [
    {
      name: 'domain',
      required: true,
    },
    {
      name: 'details',
      required: true,
    },
  ],
  options: [],
  examples: [],
} as const;

export const removeSubcommand = {
  name: 'remove',
  aliases: ['rm'],
  description: 'Remove a DNS entry using its ID',
  arguments: [
    {
      name: 'id',
      required: true,
    },
  ],
  options: [],
  examples: [],
} as const;

export const dnsCommand = {
  name: 'dns',
  aliases: [],
  description: 'Interact with DNS entries for a project',
  arguments: [],
  subcommands: [
    addSubcommand,
    importSubcommand,
    listSubcommand,
    removeSubcommand,
  ],
  options: [],
  examples: [
    {
      name: 'Add an A record for a subdomain',
      value: [
        `${packageName} dns add <DOMAIN> <SUBDOMAIN> <A | AAAA | ALIAS | CNAME | TXT>  <VALUE>`,
        `${packageName} dns add zeit.rocks api A 198.51.100.100`,
      ],
    },
    {
      name: 'Add an MX record (@ as a name refers to the domain)',
      value: [
        `${packageName} dns add <DOMAIN> '@' MX <RECORD VALUE> <PRIORITY>`,
        `${packageName} dns add zeit.rocks '@' MX mail.zeit.rocks 10`,
      ],
    },
    {
      name: 'Add an SRV record',
      value: [
        `${packageName} dns add <DOMAIN> <NAME> SRV <PRIORITY> <WEIGHT> <PORT> <TARGET>`,
        `${packageName} dns add zeit.rocks '@' SRV 10 0 389 zeit.party`,
      ],
    },
    {
      name: 'Add a CAA record',
      value: [
        `${packageName} dns add <DOMAIN> <NAME> CAA '<FLAGS> <TAG> "<VALUE>"'`,
        `${packageName} dns add zeit.rocks '@' CAA '0 issue "example.com"'`,
      ],
    },
    {
      name: 'Import a Zone file',
      value: [
        `${packageName} dns import <DOMAIN> <FILE>`,
        `${packageName} dns import zeit.rocks ./zonefile.txt`,
      ],
    },
    {
      name: 'Paginate results, where `1584722256178` is the time in milliseconds since the UNIX epoch',
      value: [
        `${packageName} dns ls --next 1584722256178`,
        `${packageName} dns ls zeit.rocks --next 1584722256178`,
      ],
    },
  ],
} as const;
