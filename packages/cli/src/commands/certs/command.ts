import { packageName } from '../../util/pkg-name';
import { limitOption, nextOption } from '../../util/arg-common';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';

const removeSubcommand = {
  name: 'rm',
  description: 'Remove a certificate by id',
  arguments: [
    {
      name: 'id',
      required: true,
    },
  ],
  options: [],
  examples: [],
} as const;

const issueSubcommand = {
  name: 'issue',
  description: ' Issue a new certificate for a domain',
  arguments: [
    {
      name: 'cn',
      required: true,
    },
  ],
  options: [
    {
      name: 'challenge-only',
      description: 'Only show challenges needed to issue a cert',
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
  examples: [],
} as const;

const listSubcommand = {
  name: 'ls',
  description: 'Show all available certificates',
  arguments: [],
  options: [
    {
      ...limitOption,
      description:
        'Number of results to return per page (default: 20, max: 100)',
      argument: 'VALUE',
    },
    {
      ...nextOption,
      description: 'Show next page of results',
    },
  ],
  examples: [],
} as const;

const addSubcommand = {
  name: 'add',
  description: 'Add a new cert',
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
  description:
    'Interact with SSL certificates. This command is intended for advanced use only. By default, Vercel manages your certificates automatically.',
  arguments: [
    {
      name: 'command',
      required: false,
    },
  ],
  subcommands: [
    addSubcommand,
    listSubcommand,
    issueSubcommand,
    removeSubcommand,
  ],
  options: [],
  examples: [
    {
      name: 'Generate a certificate with the cnames "acme.com" and "www.acme.com"`',
      value: `${packageName} certs issue acme.com www.acme.com`,
    },
    {
      name: 'Remove a certificate',
      value: `${packageName} certs rm id`,
    },
    {
      name: 'Paginate results, where `1584722256178` is the time in milliseconds since the UNIX epoch.',
      value: `${packageName} certs ls --next 1584722256178`,
    },
  ],
} as const;

export type CertsCommandSpec = ReturnType<
  typeof getFlagsSpecification<(typeof certsCommand)['options']>
>;
export type CertsCommandFlags = ReturnType<
  typeof parseArguments<CertsCommandSpec>
>['flags'];
