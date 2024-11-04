import { packageName } from '../../util/pkg-name';
import { limitOption, nextOption } from '../../util/arg-common';

export const removeSubcommand = {
  name: 'remove',
  aliases: ['rm'],
  description: 'Remove a certificate by id',
  arguments: [
    {
      name: 'id',
      required: true,
    },
  ],
  options: [],
  examples: [
    {
      name: 'Remove a certificate',
      value: `${packageName} certs rm id`,
    },
  ],
} as const;

export const issueSubcommand = {
  name: 'issue',
  aliases: [],
  description: 'Issue a new certificate for a domain',
  arguments: [
    {
      name: 'cn',
      required: true,
    },
  ],
  options: [
    {
      name: 'challenge-only',
      description: 'Only show challenges needed to issue a certificate',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'crt',
      description: 'Certificate file',
      argument: 'FILE',
      shorthand: null,
      type: String,
      deprecated: false,
    },
    {
      name: 'key',
      description: 'Certificate key file',
      argument: 'FILE',
      shorthand: null,
      type: String,
      deprecated: false,
    },
    {
      name: 'ca',
      description: 'CA certificate chain file',
      argument: 'FILE',
      shorthand: null,
      type: String,
      deprecated: false,
    },
    { name: 'overwrite', shorthand: null, type: Boolean, deprecated: false },
  ],
  examples: [
    {
      name: 'Generate a certificate with the cnames "acme.com" and "www.acme.com"`',
      value: `${packageName} certs issue acme.com www.acme.com`,
    },
  ],
} as const;

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'Show all available certificates',
  arguments: [],
  options: [limitOption, nextOption],
  examples: [
    {
      name: 'Paginate results, where `1584722256178` is the time in milliseconds since the UNIX epoch.',
      value: `${packageName} certs ls --next 1584722256178`,
    },
  ],
} as const;

export const addSubcommand = {
  name: 'add',
  aliases: [],
  description: 'Add a new certificate',
  arguments: [],
  options: [
    {
      name: 'crt',
      description: 'Certificate file',
      argument: 'FILE',
      shorthand: null,
      type: String,
      deprecated: false,
    },
    {
      name: 'key',
      description: 'Certificate key file',
      argument: 'FILE',
      shorthand: null,
      type: String,
      deprecated: false,
    },
    {
      name: 'ca',
      description: 'CA certificate chain file',
      argument: 'FILE',
      shorthand: null,
      type: String,
      deprecated: false,
    },
    {
      name: 'overwrite',
      description: '',
      shorthand: null,
      type: Boolean,
      deprecated: true,
    },
  ],
  examples: [],
} as const;

export const certsCommand = {
  name: 'certs',
  aliases: ['cert'],
  description:
    'Interact with SSL certificates. This command is intended for advanced use only. By default, Vercel manages your certificates automatically.',
  arguments: [],
  subcommands: [
    addSubcommand,
    issueSubcommand,
    listSubcommand,
    removeSubcommand,
  ],
  options: [],
  examples: [
    ...issueSubcommand.examples,
    ...removeSubcommand.examples,
    ...listSubcommand.examples,
  ],
} as const;
