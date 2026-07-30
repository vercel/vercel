import { packageName } from '../../util/pkg-name';
import { formatOption, jsonOption, yesOption } from '../../util/arg-common';

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List Global Config stores for the current team',
  default: true,
  arguments: [],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'List Global Configs as JSON',
      value: `${packageName} global-config list --json`,
    },
  ],
} as const;

export const addSubcommand = {
  name: 'add',
  aliases: ['create'],
  description: 'Create a Global Config store',
  arguments: [
    {
      name: 'slug',
      required: true,
    },
  ],
  options: [
    formatOption,
    jsonOption,
    {
      name: 'items',
      shorthand: null,
      type: String,
      argument: 'JSON',
      deprecated: false,
      description:
        'Optional JSON object of initial items `{ "key": <value>, ... }`',
    },
  ],
  examples: [
    {
      name: 'Create a store with slug `flags`',
      value: `${packageName} global-config add flags`,
    },
  ],
} as const;

export const getSubcommand = {
  name: 'get',
  aliases: ['inspect'],
  description: 'Show metadata for a Global Config (id `ecfg_…` or slug)',
  arguments: [
    {
      name: 'id-or-slug',
      required: true,
    },
  ],
  options: [formatOption, jsonOption],
  examples: [],
} as const;

export const updateSubcommand = {
  name: 'update',
  aliases: [],
  description:
    'Rename a Global Config (`--slug`) and/or patch items (`--patch` JSON)',
  arguments: [
    {
      name: 'id-or-slug',
      required: true,
    },
  ],
  options: [
    formatOption,
    jsonOption,
    {
      name: 'slug',
      shorthand: null,
      type: String,
      argument: 'SLUG',
      deprecated: false,
      description: 'New slug for the Global Config',
    },
    {
      name: 'patch',
      shorthand: null,
      type: String,
      argument: 'JSON',
      deprecated: false,
      description:
        'JSON for `PATCH /v1/global-config/:id/items`: `{"items":[...]}` or a bare array. Each item needs `operation` (create | update | upsert | delete), `key`, and usually `value` (see REST API: update-edge-config-items-in-batch)',
    },
  ],
  examples: [],
} as const;

export const removeSubcommand = {
  name: 'remove',
  aliases: ['rm', 'delete'],
  description: 'Delete a Global Config store',
  arguments: [
    {
      name: 'id-or-slug',
      required: true,
    },
  ],
  options: [yesOption, formatOption, jsonOption],
  examples: [],
} as const;

export const itemsSubcommand = {
  name: 'items',
  aliases: [],
  description: 'List items in a Global Config, or fetch one item with `--key`',
  arguments: [
    {
      name: 'id-or-slug',
      required: true,
    },
  ],
  options: [
    formatOption,
    jsonOption,
    {
      name: 'key',
      shorthand: 'k',
      type: String,
      argument: 'KEY',
      deprecated: false,
      description: 'When set, fetch a single item by key',
    },
  ],
  examples: [],
} as const;

export const tokensSubcommand = {
  name: 'tokens',
  aliases: [],
  description:
    'List, create (`--add`), or revoke (`--remove`) read tokens for a Global Config',
  arguments: [
    {
      name: 'id-or-slug',
      required: true,
    },
  ],
  options: [
    formatOption,
    jsonOption,
    yesOption,
    {
      name: 'add',
      shorthand: null,
      type: String,
      argument: 'LABEL',
      deprecated: false,
      description: 'Create a token with this label (1–52 characters)',
    },
    {
      name: 'remove',
      shorthand: null,
      type: [String],
      argument: 'ID_OR_TOKEN',
      deprecated: false,
      description:
        'Revoke one or more tokens by id or plaintext token (repeatable). Requires `--yes` in non-interactive mode',
    },
  ],
  examples: [],
} as const;

export const backupsSubcommand = {
  name: 'backups',
  aliases: [],
  description: 'List, inspect, or restore Global Config backups',
  arguments: [
    {
      name: 'id-or-slug',
      required: true,
    },
  ],
  options: [
    formatOption,
    jsonOption,
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when restoring',
    },
    {
      name: 'backup-version',
      shorthand: null,
      type: String,
      argument: 'VERSION_ID',
      deprecated: false,
      description: 'Fetch a single backup by version id',
    },
    {
      name: 'restore',
      shorthand: null,
      type: String,
      argument: 'VERSION_ID',
      deprecated: false,
      description:
        'Restore items from the backup version id. Requires confirmation because it updates live Global Config items',
    },
    {
      name: 'limit',
      shorthand: null,
      type: Number,
      argument: 'NUMBER',
      deprecated: false,
      description: 'Maximum number of backups to list (0-50)',
    },
    {
      name: 'next',
      shorthand: null,
      type: String,
      argument: 'CURSOR',
      deprecated: false,
      description: 'Pagination cursor from a previous backup list response',
    },
  ],
  examples: [
    {
      name: 'List backups for a Global Config',
      value: `${packageName} global-config backups my-store`,
    },
    {
      name: 'Inspect a backup as JSON',
      value: `${packageName} global-config backups my-store --backup-version <version-id> --json`,
    },
    {
      name: 'Restore a backup',
      value: `${packageName} global-config backups my-store --restore <version-id> --yes`,
    },
  ],
} as const;

export const globalConfigCommand = {
  name: 'global-config',
  aliases: ['edge-config'],
  description: 'Manage Global Config stores (dashboard API parity)',
  arguments: [],
  subcommands: [
    listSubcommand,
    addSubcommand,
    getSubcommand,
    updateSubcommand,
    removeSubcommand,
    itemsSubcommand,
    tokensSubcommand,
    backupsSubcommand,
  ],
  options: [],
  examples: [
    {
      name: 'List stores',
      value: `${packageName} global-config list`,
    },
  ],
} as const;
