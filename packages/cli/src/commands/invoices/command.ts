import { formatOption, jsonOption } from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

export const invoiceStatuses = [
  'draft',
  'open',
  'paid',
  'uncollectible',
  'void',
] as const;

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List invoices',
  default: true,
  arguments: [],
  options: [
    {
      name: 'details',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Show individual line items for each invoice',
    },
    {
      name: 'status',
      shorthand: null,
      type: [String],
      argument: 'STATUS',
      deprecated: false,
      description: `Filter by status: ${invoiceStatuses.join(', ')} (can be used multiple times)`,
    },
    {
      name: 'limit',
      shorthand: null,
      type: Number,
      argument: 'NUMBER',
      deprecated: false,
      description: 'Number of invoices to return (default: 10, max: 50)',
    },
    {
      name: 'next',
      shorthand: 'N',
      type: String,
      argument: 'CURSOR',
      deprecated: false,
      description: 'Show next page of results',
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'List invoices',
      value: `${packageName} invoices ls`,
    },
    {
      name: 'List invoices with line items',
      value: `${packageName} invoices ls --details`,
    },
    {
      name: 'List open invoices as JSON',
      value: `${packageName} invoices ls --status open --json`,
    },
  ],
} as const;

export const upcomingSubcommand = {
  name: 'upcoming',
  aliases: [],
  description: 'Show the upcoming invoice for the current billing period',
  arguments: [],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Show the upcoming invoice',
      value: `${packageName} invoices upcoming`,
    },
  ],
} as const;

export const invoicesCommand = {
  name: 'invoices',
  aliases: ['invoice'],
  description: 'List invoices and show the upcoming invoice',
  arguments: [],
  subcommands: [listSubcommand, upcomingSubcommand],
  options: [],
  examples: [],
} as const;
