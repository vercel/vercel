import {
  allOption,
  formatOption,
  jsonOption,
  projectOption,
  yesOption,
} from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';
import {
  blobAccessOption,
  blobRegionOption,
  edgeConfigItemsOption,
  listStorageProviderTypes,
} from '../../util/storage/providers';

const environmentOption = {
  name: 'environment',
  shorthand: 'e',
  type: [String],
  argument: 'ENVIRONMENT',
  deprecated: false,
  description:
    'Environment to connect (repeatable: production, preview, development) (default: all three).',
} as const;

const authOption = {
  name: 'auth',
  shorthand: null,
  type: String,
  argument: 'MODE',
  deprecated: false,
  description:
    'Credential mode: `oidc` or `token` (default: `oidc`). Blob only: `token` writes long-lived credentials and requires --add-rw-token. Other stores use the credentials their provider issues.',
} as const;

const updateEnvironmentOption = {
  ...environmentOption,
  description:
    'Environment to connect (repeatable: production, preview, development) (default: the environments the connection already covers).',
} as const;

const updateAuthOption = {
  ...authOption,
  description:
    'Credential mode: `oidc` or `token` (default: the mode the connection already uses, so unrelated updates never rotate credentials). Blob only: `token` requires --add-rw-token.',
} as const;

const addRwTokenOption = {
  name: 'add-rw-token',
  shorthand: null,
  type: Boolean,
  deprecated: false,
  description:
    'Blob only: explicitly write the static read-write token env var. Required for --auth token, and additive on top of --auth oidc.',
} as const;

const prefixOption = {
  name: 'prefix',
  shorthand: null,
  type: String,
  argument: 'PREFIX',
  deprecated: false,
  description:
    'Prefix for the generated environment variable names (e.g. --prefix UPLOADS writes UPLOADS_STORE_ID)',
} as const;

const dryRunOption = {
  name: 'dry-run',
  shorthand: null,
  type: Boolean,
  deprecated: false,
  description:
    'Preview connection changes without applying them (provider variable names may be unavailable)',
} as const;

export const connectSubcommand = {
  name: 'connect',
  aliases: [],
  description:
    'Connect a storage resource (Blob, Global Config, Marketplace, or first-party) to a project',
  arguments: [
    {
      name: 'store',
      required: true,
    },
  ],
  options: [
    projectOption,
    environmentOption,
    authOption,
    addRwTokenOption,
    prefixOption,
    dryRunOption,
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when connecting a resource',
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Connect a store to the linked project in every environment',
      placeholders: ['<store>'],
      value: `${packageName} storage connect <store>`,
    },
    {
      name: 'Connect to a specific project and environments',
      value: `${packageName} storage connect my-blob-store --project my-app --environment production --environment preview`,
    },
    {
      name: 'Preview the connection and Environment Variable changes',
      value: [
        `${packageName} storage connect my-blob-store --dry-run`,
        `${packageName} storage connect my-blob-store --dry-run --json`,
      ],
    },
    {
      name: 'Opt in to the static read-write token alongside OIDC',
      value: `${packageName} storage connect my-blob-store --add-rw-token --yes`,
    },
    {
      name: 'Use only static credentials (requires the explicit opt-in)',
      value: `${packageName} storage connect my-blob-store --auth token --add-rw-token --yes`,
    },
  ],
} as const;

export const statusSubcommand = {
  name: 'status',
  aliases: [],
  description:
    'Show storage connections, their environments, credential mode, and environment variables',
  arguments: [
    {
      name: 'store',
      required: false,
    },
  ],
  options: [
    projectOption,
    {
      ...allOption,
      description: 'Show every storage resource in the current scope',
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Show the storage connections of the linked project',
      value: `${packageName} storage status`,
    },
    {
      name: 'Show every project connected to one store',
      value: `${packageName} storage status my-blob-store`,
    },
    {
      name: 'Show every storage resource in the current scope as JSON',
      value: `${packageName} storage status --all --json`,
    },
  ],
} as const;

export const updateSubcommand = {
  name: 'update',
  aliases: [],
  description:
    'Update an existing storage connection (environments, prefix, or Blob credential mode)',
  arguments: [
    {
      name: 'store',
      required: true,
    },
  ],
  options: [
    projectOption,
    updateEnvironmentOption,
    updateAuthOption,
    addRwTokenOption,
    prefixOption,
    dryRunOption,
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when updating a connection',
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Move an existing connection to OIDC credentials',
      value: `${packageName} storage update my-blob-store --auth oidc --yes`,
    },
    {
      name: 'Change the environments of a connection',
      value: `${packageName} storage update my-blob-store --environment production --yes`,
    },
    {
      name: 'Preview the environment variable changes without applying them',
      value: `${packageName} storage update my-blob-store --auth oidc --dry-run`,
    },
  ],
} as const;

export const disconnectSubcommand = {
  descriptionTone: 'normal',
  name: 'disconnect',
  aliases: [],
  description:
    'Disconnect a storage resource from a project. Removes its environment variables, so it always requires interactive confirmation.',
  arguments: [
    {
      name: 'store',
      required: true,
    },
  ],
  options: [
    projectOption,
    {
      ...allOption,
      description: 'Disconnect every project from the specified resource',
      // Disconnecting every project takes `--all` spelled out. The old `-a`
      // still works, hidden, until the next major.
      shorthand: null,
      deprecatedShorthand: 'a',
    },
    dryRunOption,
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Disconnect a store from the linked project (always asks for confirmation)',
      value: `${packageName} storage disconnect my-blob-store`,
    },
    {
      name: 'Disconnect a store from every project',
      value: `${packageName} storage disconnect my-blob-store --all`,
    },
    {
      name: 'Preview the environment variables that would be removed',
      value: [
        `${packageName} storage disconnect my-blob-store --dry-run`,
        `${packageName} storage disconnect my-blob-store --dry-run --json`,
      ],
    },
  ],
} as const;

const typeOption = {
  name: 'type',
  shorthand: null,
  type: String,
  argument: 'TYPE',
  deprecated: false,
  description: `Store type: ${listStorageProviderTypes().join(', ')}`,
} as const;

export const listSubcommand = {
  name: 'list',
  aliases: [],
  description: 'List storage resources in the current scope',
  arguments: [],
  options: [
    {
      ...typeOption,
      description: `Only list stores of one type (e.g. ${listStorageProviderTypes().join(', ')}, integration)`,
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'List every store in the current scope',
      value: `${packageName} storage list`,
    },
    {
      name: 'List only Global Config stores as JSON',
      value: `${packageName} storage list --type global-config --json`,
    },
  ],
} as const;

export const createSubcommand = {
  name: 'create',
  aliases: [],
  description: `Create a storage resource (${listStorageProviderTypes().join(', ')})`,
  arguments: [
    {
      name: 'name',
      required: true,
    },
  ],
  options: [
    typeOption,
    blobAccessOption,
    blobRegionOption,
    edgeConfigItemsOption,
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Create a private Blob store',
      value: `${packageName} storage create my-uploads --type blob --access private`,
    },
    {
      name: 'Create a Blob store in a specific region',
      value: `${packageName} storage create my-uploads --type blob --access public --region fra1`,
    },
    {
      name: 'Create a Global Config with initial items',
      value: `${packageName} storage create flags --type global-config --items '{"enabled":true}'`,
    },
    {
      name: 'Create a store and read the result as JSON',
      value: `${packageName} storage create my-uploads --type blob --access private --json`,
    },
  ],
} as const;

const matchTypeOption = {
  ...typeOption,
  description: `Only match stores of one type when several share a name (e.g. ${listStorageProviderTypes().join(', ')}, integration)`,
} as const;

export const getSubcommand = {
  name: 'inspect',
  aliases: ['get'],
  description: 'Show the details of one storage resource',
  arguments: [
    {
      name: 'store',
      required: true,
    },
  ],
  options: [matchTypeOption, formatOption, jsonOption],
  examples: [
    {
      name: 'Show a store by name or ID',
      value: [
        `${packageName} storage inspect my-blob-store`,
        `${packageName} storage inspect store_abc123 --json`,
        `${packageName} storage inspect uploads --type global-config`,
      ],
    },
  ],
} as const;

export const deleteSubcommand = {
  descriptionTone: 'normal',
  name: 'delete',
  aliases: ['rm', 'del'],
  description:
    'Delete a Blob store or Global Config (Marketplace resources: use `vercel integration resource delete`). This cannot be undone and removes its project connections, so it always requires interactive confirmation.',
  arguments: [
    {
      name: 'store',
      required: true,
    },
  ],
  options: [matchTypeOption],
  examples: [
    {
      name: 'Delete a store (always asks for confirmation)',
      value: `${packageName} storage delete my-blob-store`,
    },
    {
      name: 'Disambiguate when a Blob store and a Global Config share a name',
      value: `${packageName} storage delete uploads --type blob`,
    },
  ],
} as const;

export const storageCommand = {
  name: 'storage',
  aliases: [],
  summary: 'Manage project storage resources',
  description:
    'List, inspect, connect, update, and disconnect storage resources (Blob, Global Config, Marketplace, and first-party) for your projects. Create and delete Blob stores and Global Config; Marketplace resources use `vercel integration`.',
  options: [],
  arguments: [],
  subcommands: [
    listSubcommand,
    createSubcommand,
    getSubcommand,
    deleteSubcommand,
    connectSubcommand,
    statusSubcommand,
    updateSubcommand,
    disconnectSubcommand,
  ],
  examples: [
    {
      name: 'List the stores in the current scope',
      value: `${packageName} storage list`,
    },
    {
      name: 'Create a store and connect it to the linked project',
      value: [
        `${packageName} storage create my-uploads --type blob --access private`,
        `${packageName} storage connect my-uploads --yes`,
      ],
    },
    {
      name: 'Inspect what is connected today',
      value: `${packageName} storage status`,
    },
  ],
} as const;
