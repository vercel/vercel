import { formatOption } from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

const environmentOption = {
  name: 'environment',
  shorthand: null,
  type: String,
  argument: 'ENVIRONMENT',
  deprecated: false,
  description:
    'Environment to target: production, preview, development, or a custom environment (default: development)',
} as const;

const resourceOption = {
  name: 'resource',
  shorthand: null,
  type: String,
  argument: 'RESOURCE_ID_OR_NAME',
  deprecated: false,
  description:
    'Database integration resource to target. If omitted, Vercel resolves the connected project database when unambiguous',
} as const;

const projectOption = {
  name: 'project',
  shorthand: null,
  type: String,
  argument: 'PROJECT',
  deprecated: false,
  description:
    'Project name or ID to target. Defaults to the linked project in the current directory',
} as const;

const roleOption = {
  name: 'role',
  shorthand: null,
  type: String,
  argument: 'ROLE',
  deprecated: false,
  description:
    'Temporary database role to request: readonly, readwrite, or admin (default: readonly)',
} as const;

const reasonOption = {
  name: 'reason',
  shorthand: null,
  type: String,
  argument: 'REASON',
  deprecated: false,
  description: 'Audit reason for the database operation',
} as const;

export const querySubcommand = {
  name: 'query',
  aliases: ['q'],
  description:
    'Run a database query through a short-lived, audited Vercel-managed session',
  arguments: [
    {
      name: 'sql',
      required: true,
    },
  ],
  options: [
    environmentOption,
    projectOption,
    resourceOption,
    roleOption,
    reasonOption,
    {
      name: 'confirm-production-write',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Allow readwrite or admin operations against production without an interactive prompt',
    },
    formatOption,
  ],
  examples: [
    {
      name: 'Run a read-only query against the linked project development database',
      value: `${packageName} db query "select * from users limit 10"`,
    },
    {
      name: 'Run a production write with an explicit temporary role and audit reason',
      value: `${packageName} db query "update users set plan = 'pro' where id = 'usr_123'" --environment production --role readwrite --reason "support ticket 123" --confirm-production-write`,
    },
    {
      name: 'Output query results as JSON',
      value: `${packageName} db query "select count(*) from users" --format=json`,
    },
  ],
} as const;

export const shellSubcommand = {
  name: 'shell',
  aliases: [],
  description:
    'Open a short-lived, audited database shell session without using project environment credentials',
  arguments: [],
  options: [
    environmentOption,
    projectOption,
    resourceOption,
    roleOption,
    reasonOption,
    {
      name: 'ttl',
      shorthand: null,
      type: String,
      argument: 'DURATION',
      deprecated: false,
      description: 'Requested session lifetime, for example 15m (default: 15m)',
    },
    {
      name: 'confirm-production-write',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Allow readwrite or admin sessions against production without an interactive prompt',
    },
    formatOption,
  ],
  examples: [
    {
      name: 'Open a read-only development shell',
      value: `${packageName} db shell`,
    },
    {
      name: 'Open a short-lived production read-only shell for a specific resource',
      value: `${packageName} db shell --environment production --resource neon-store --role readonly --ttl 10m`,
    },
  ],
} as const;

export const dbCommand = {
  name: 'db',
  aliases: ['database'],
  description: 'Perform secure database operations through Vercel',
  arguments: [],
  subcommands: [querySubcommand, shellSubcommand],
  options: [],
  examples: [],
} as const;
