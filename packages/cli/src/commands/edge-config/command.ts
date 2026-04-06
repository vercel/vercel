import { packageName } from '../../util/pkg-name';
import { formatOption, yesOption } from '../../util/arg-common';

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description:
    'List Edge Config stores for the current team, or stores linked via the linked project’s env vars (`--linked`)',
  default: true,
  arguments: [],
  options: [
    formatOption,
    {
      name: 'linked',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Edge Config stores connected to this project (GET /v1/storage/stores, edge-config only)',
    },
  ],
  examples: [
    {
      name: 'List Edge Configs as JSON',
      value: `${packageName} edge-config list --format json`,
    },
    {
      name: 'Edge Configs referenced by linked project env vars',
      value: `${packageName} edge-config list --linked`,
    },
  ],
} as const;

export const addSubcommand = {
  name: 'add',
  aliases: ['create'],
  description: 'Create an Edge Config store',
  arguments: [
    {
      name: 'slug',
      required: true,
    },
  ],
  options: [
    formatOption,
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
      value: `${packageName} edge-config add flags`,
    },
  ],
} as const;

export const getSubcommand = {
  name: 'get',
  aliases: ['inspect'],
  description: 'Show metadata for an Edge Config (id `ecfg_…` or slug)',
  arguments: [
    {
      name: 'id-or-slug',
      required: true,
    },
  ],
  options: [formatOption],
  examples: [],
} as const;

export const updateSubcommand = {
  name: 'update',
  aliases: [],
  description:
    'Rename an Edge Config (`--slug`) and/or patch items (`--patch` JSON)',
  arguments: [
    {
      name: 'id-or-slug',
      required: true,
    },
  ],
  options: [
    formatOption,
    {
      name: 'slug',
      shorthand: null,
      type: String,
      argument: 'SLUG',
      deprecated: false,
      description: 'New slug for the Edge Config',
    },
    {
      name: 'patch',
      shorthand: null,
      type: String,
      argument: 'JSON',
      deprecated: false,
      description:
        'JSON for `PATCH /v1/edge-config/:id/items`: `{"items":[...]}` or a bare array. Each item needs `operation` (create | update | upsert | delete), `key`, and usually `value` (see REST API: update-edge-config-items-in-batch)',
    },
  ],
  examples: [],
} as const;

export const setSubcommand = {
  name: 'set',
  aliases: [],
  description:
    'Upsert a single key (`PUT /v1/edge-config/:id/item/:key` with body `{ value }`)',
  arguments: [
    {
      name: 'id-or-slug',
      required: true,
    },
    {
      name: 'key',
      required: true,
    },
  ],
  options: [
    formatOption,
    {
      name: 'value',
      shorthand: null,
      type: String,
      argument: 'JSON',
      deprecated: false,
      description:
        'JSON value (string, number, object, array, boolean, or null). Plain text is stored as a string.',
    },
  ],
  examples: [
    {
      name: 'Set a boolean flag',
      value: `${packageName} edge-config set my-store foo --value true`,
    },
  ],
} as const;

export const removeSubcommand = {
  name: 'remove',
  aliases: ['rm', 'delete'],
  description: 'Delete an Edge Config store',
  arguments: [
    {
      name: 'id-or-slug',
      required: true,
    },
  ],
  options: [yesOption, formatOption],
  examples: [],
} as const;

export const itemsSubcommand = {
  name: 'items',
  aliases: [],
  description: 'List items in an Edge Config, or fetch one item with `--key`',
  arguments: [
    {
      name: 'id-or-slug',
      required: true,
    },
  ],
  options: [
    formatOption,
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
    'List, create (`--add`), or revoke (`--remove`) read tokens for an Edge Config',
  arguments: [
    {
      name: 'id-or-slug',
      required: true,
    },
  ],
  options: [
    formatOption,
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
      argument: 'TOKEN',
      deprecated: false,
      description:
        'Revoke one or more token strings (repeatable). Requires `--yes` in non-interactive mode',
    },
  ],
  examples: [],
} as const;

export const edgeConfigCommand = {
  name: 'edge-config',
  aliases: [],
  description: 'Manage Edge Config stores (dashboard API parity)',
  arguments: [],
  subcommands: [
    listSubcommand,
    addSubcommand,
    getSubcommand,
    updateSubcommand,
    setSubcommand,
    removeSubcommand,
    itemsSubcommand,
    tokensSubcommand,
  ],
  options: [],
  examples: [
    {
      name: 'List stores',
      value: `${packageName} edge-config list`,
    },
  ],
} as const;
