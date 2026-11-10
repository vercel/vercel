import { packageName } from '../../util/pkg-name';
import {
  formatOption,
  jsonOption,
  limitOption,
  nextCursorOption,
  yesOption,
} from '../../util/arg-common';

const recordTypesHelp = {
  title: 'Record Types',
  body: ['A, AAAA, ALIAS, CAA, CNAME, MX, SRV, TXT'],
} as const;

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
  description:
    'List DNS entries. Pass a domain to list its records, or omit the argument to list records across every domain on the scope',
  default: true,
  arguments: [
    {
      name: 'domain',
      required: false,
    },
  ],
  options: [limitOption, nextCursorOption, formatOption, jsonOption],
  examples: [],
} as const;

export const addSubcommand = {
  name: 'add',
  aliases: [],
  description: 'Add a DNS record',
  arguments: [
    {
      name: 'domain',
      required: true,
    },
    {
      name: 'details',
      required: true,
      description: 'Record name, type, and value',
    },
  ],
  options: [],
  examples: [],
  helpSections: [recordTypesHelp],
} as const;

export const inspectSubcommand = {
  name: 'inspect',
  aliases: [],
  description: 'Show a DNS record in full using its ID',
  arguments: [
    {
      name: 'id',
      required: true,
    },
  ],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Show a DNS record in full',
      value: `${packageName} dns inspect rec_1a2b3c4d5e6f`,
    },
    {
      name: 'Show a DNS record as JSON',
      value: `${packageName} dns inspect rec_1a2b3c4d5e6f --json`,
    },
  ],
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
  options: [
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when removing a DNS record',
    },
  ],
  examples: [],
} as const;

export const updateSubcommand = {
  name: 'update',
  aliases: [],
  description: 'Update an existing DNS record using its ID',
  arguments: [
    {
      name: 'id',
      required: true,
    },
  ],
  options: [
    {
      name: 'name',
      shorthand: null,
      type: String,
      argument: 'NAME',
      deprecated: false,
      description: "New name of the DNS record ('@' refers to the domain)",
    },
    {
      name: 'type',
      shorthand: null,
      type: String,
      argument: 'TYPE',
      deprecated: false,
      description:
        'New type of the DNS record (A, AAAA, ALIAS, CAA, CNAME, MX, SRV, TXT)',
    },
    {
      name: 'value',
      shorthand: null,
      type: String,
      argument: 'VALUE',
      deprecated: false,
      description: 'New value of the DNS record',
    },
    {
      name: 'ttl',
      shorthand: null,
      type: Number,
      argument: 'SECONDS',
      deprecated: false,
      description: 'New Time to live (TTL) of the DNS record, in seconds',
    },
    {
      name: 'mx-priority',
      shorthand: null,
      type: Number,
      argument: 'PRIORITY',
      deprecated: false,
      description: 'New priority of the MX record',
    },
    {
      name: 'srv-priority',
      shorthand: null,
      type: Number,
      argument: 'PRIORITY',
      deprecated: false,
      description: 'New priority of the SRV record',
    },
    {
      name: 'srv-weight',
      shorthand: null,
      type: Number,
      argument: 'WEIGHT',
      deprecated: false,
      description: 'New weight of the SRV record',
    },
    {
      name: 'srv-port',
      shorthand: null,
      type: Number,
      argument: 'PORT',
      deprecated: false,
      description: 'New port of the SRV record',
    },
    {
      name: 'srv-target',
      shorthand: null,
      type: String,
      argument: 'TARGET',
      deprecated: false,
      description: 'New target of the SRV record',
    },
    {
      name: 'comment',
      shorthand: null,
      type: String,
      argument: 'TEXT',
      deprecated: false,
      description: 'A comment to add context on what this DNS record is for',
    },
  ],
  examples: [
    {
      name: 'Update the value of an A record',
      value: `${packageName} dns update rec_1a2b3c4d5e6f --value 198.51.100.100`,
    },
    {
      name: 'Update the name and TTL of a record',
      value: `${packageName} dns update rec_1a2b3c4d5e6f --name api --ttl 300`,
    },
    {
      name: 'Update an MX record priority',
      value: `${packageName} dns update rec_1a2b3c4d5e6f --mx-priority 10`,
    },
    {
      name: 'Update an SRV record',
      value: `${packageName} dns update rec_1a2b3c4d5e6f --srv-priority 10 --srv-weight 0 --srv-port 389 --srv-target example.net`,
    },
  ],
} as const;

export const dnsCommand = {
  name: 'dns',
  aliases: [],
  description: 'Manage DNS records for your domains',
  arguments: [],
  subcommands: [
    addSubcommand,
    importSubcommand,
    inspectSubcommand,
    listSubcommand,
    removeSubcommand,
    updateSubcommand,
  ],
  options: [],
  helpSections: [recordTypesHelp],
  examples: [
    {
      name: 'Add an A record for a subdomain',
      placeholders: ['<DOMAIN>', '<SUBDOMAIN>', '<VALUE>'],
      value: `${packageName} dns add <DOMAIN> <SUBDOMAIN> A <VALUE>`,
    },
    {
      name: 'Add an MX record (@ as a name refers to the domain)',
      placeholders: ['<DOMAIN>', '<RECORD VALUE>', '<PRIORITY>'],
      value: `${packageName} dns add <DOMAIN> '@' MX <RECORD VALUE> <PRIORITY>`,
    },
    {
      name: 'Add an SRV record',
      placeholders: [
        '<DOMAIN>',
        '<NAME>',
        '<PRIORITY>',
        '<WEIGHT>',
        '<PORT>',
        '<TARGET>',
      ],
      value: `${packageName} dns add <DOMAIN> <NAME> SRV <PRIORITY> <WEIGHT> <PORT> <TARGET>`,
    },
    {
      name: 'Add a CAA record',
      placeholders: ['<DOMAIN>', '<NAME>', '<FLAGS>', '<TAG>', '<VALUE>'],
      value: `${packageName} dns add <DOMAIN> <NAME> CAA '<FLAGS> <TAG> "<VALUE>"'`,
    },
    {
      name: 'Update a DNS record value',
      placeholders: ['<ID>', '<VALUE>'],
      value: `${packageName} dns update <ID> --value <VALUE>`,
    },
    {
      name: 'Update a DNS record name and TTL',
      placeholders: ['<ID>', '<NAME>', '<SECONDS>'],
      value: `${packageName} dns update <ID> --name <NAME> --ttl <SECONDS>`,
    },
    {
      name: 'Show a DNS record in full using its ID',
      placeholders: ['<ID>'],
      value: `${packageName} dns inspect <ID>`,
    },
    {
      name: 'Import a Zone file',
      placeholders: ['<DOMAIN>', '<FILE>'],
      value: `${packageName} dns import <DOMAIN> <FILE>`,
    },
    {
      name: 'Get the next page of DNS records',
      placeholders: ['<CURSOR>'],
      value: `${packageName} dns list --next <CURSOR>`,
    },
    {
      name: 'Get the next page for a domain',
      placeholders: ['<DOMAIN>', '<CURSOR>'],
      value: `${packageName} dns list <DOMAIN> --next <CURSOR>`,
    },
  ],
} as const;
