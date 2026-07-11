const ifMatchOption = {
  name: 'if-match',
  shorthand: null,
  type: String,
  deprecated: false,
  description:
    "Only perform the operation if the blob's ETag matches this value",
  argument: 'STRING',
} as const;

const ifNoneMatchOption = {
  name: 'if-none-match',
  shorthand: null,
  type: String,
  deprecated: false,
  description:
    "Only return content if the blob's ETag does not match this value (returns 304 if unchanged)",
  argument: 'STRING',
} as const;

const accessOption = {
  name: 'access',
  shorthand: 'a',
  type: String,
  deprecated: false,
  description: 'Access level for the blob: public or private (required)',
  argument: 'String',
  choices: ['public', 'private'],
} as const;

import { yesOption } from '../../util/arg-common';

const environmentOption = {
  name: 'environment',
  shorthand: 'e',
  type: [String],
  deprecated: false,
  argument: 'ENV',
  description:
    'Environment to connect (can be repeated: production, preview, development). Defaults to all when --yes is used.',
} as const;

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List all files in the Blob store',
  arguments: [],
  options: [
    {
      name: 'limit',
      shorthand: 'l',
      type: Number,
      deprecated: false,
      description:
        'Number of results to return per page (default: 10, max: 1000)',
      argument: 'NUMBER',
    },
    {
      name: 'cursor',
      shorthand: 'c',
      type: String,
      deprecated: false,
      description: 'Cursor from previous page to start listing from',
      argument: 'STRING',
    },
    {
      name: 'prefix',
      shorthand: 'p',
      type: String,
      deprecated: false,
      description: 'Prefix to filter Blobs by',
      argument: 'STRING',
    },
    {
      name: 'mode',
      shorthand: 'm',
      type: String,
      deprecated: false,
      description:
        'Mode to filter Blobs by either folded or expanded (default: expanded)',
      argument: 'String',
      choices: ['folded', 'expanded'],
    },
  ],
  examples: [],
} as const;

export const putSubcommand = {
  name: 'put',
  aliases: [],
  description: 'Upload a file to the Blob store',
  arguments: [
    {
      name: 'pathToFile',
      required: true,
    },
  ],
  options: [
    accessOption,
    {
      name: 'add-random-suffix',
      shorthand: 'r',
      type: Boolean,
      deprecated: false,
      description: 'Add a random suffix to the file name (default: false)',
      argument: 'Boolean',
    },
    {
      name: 'pathname',
      shorthand: 'p',
      type: String,
      deprecated: false,
      description: 'Pathname to upload the file to (default: filename)',
      argument: 'String',
    },
    {
      name: 'multipart',
      shorthand: 'u',
      type: Boolean,
      deprecated: false,
      description:
        'If true upload the file in multiple small chunks for performance and reliability (default: true)',
      argument: 'Boolean',
    },
    {
      name: 'content-type',
      shorthand: 't',
      type: String,
      deprecated: false,
      description:
        'Overwrite the content-type. Will be inferred from the file extension if not provided',
      argument: 'String',
    },
    {
      name: 'cache-control-max-age',
      shorthand: 'c',
      type: Number,
      deprecated: false,
      description:
        'Max-age of the cache-control header directive (default: 2592000 = 30 days)',
      argument: 'Number',
    },
    {
      name: 'allow-overwrite',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Overwrite the file if it already exists (default: false)',
      argument: 'Boolean',
    },
    ifMatchOption,
  ],
  examples: [],
} as const;

export const delSubcommand = {
  name: 'del',
  aliases: [],
  description: 'Delete a file from the Blob store',
  arguments: [
    {
      name: 'urlsOrPathnames',
      required: true,
    },
  ],
  options: [ifMatchOption],
  examples: [],
} as const;

export const copySubcommand = {
  name: 'copy',
  aliases: ['cp'],
  description: 'Copy a file in the Blob store',
  arguments: [
    {
      name: 'fromUrlOrPathname',
      required: true,
    },
    {
      name: 'toPathname',
      required: true,
    },
  ],
  options: [
    accessOption,
    {
      name: 'add-random-suffix',
      shorthand: 'r',
      type: Boolean,
      deprecated: false,
      description: 'Add a random suffix to the file name',
      argument: 'Boolean',
    },
    {
      name: 'content-type',
      shorthand: 't',
      type: String,
      deprecated: false,
      description:
        'Overwrite the content-type. Will be inferred from the file extension if not provided',
      argument: 'String',
    },
    {
      name: 'cache-control-max-age',
      shorthand: 'c',
      type: Number,
      deprecated: false,
      description:
        'Max-age of the cache-control header directive (default: 2592000 = 30 days)',
      argument: 'Number',
    },
    ifMatchOption,
  ],
  examples: [],
} as const;

export const getSubcommand = {
  name: 'get',
  aliases: [],
  description: 'Download a blob by URL or pathname',
  arguments: [
    {
      name: 'urlOrPathname',
      required: true,
    },
  ],
  options: [
    accessOption,
    {
      name: 'output',
      shorthand: 'o',
      type: String,
      deprecated: false,
      description: 'Save blob content to a file instead of stdout',
      argument: 'PATH',
    },
    ifNoneMatchOption,
  ],
  examples: [],
} as const;

export const signedTokenSubcommand = {
  name: 'signed-token',
  aliases: [],
  description: 'Issue a short-lived signed token for Blob operations',
  arguments: [],
  options: [
    {
      name: 'pathname',
      shorthand: 'p',
      type: String,
      deprecated: false,
      description: 'Pathname scope for the token. Defaults to "*" when omitted',
      argument: 'STRING',
    },
    {
      name: 'operation',
      shorthand: 'o',
      type: [String],
      deprecated: false,
      description: 'Allowed operation(s): get, head, put, delete (repeatable)',
      argument: 'OPERATION',
      choices: ['get', 'head', 'put', 'delete'],
    },
    {
      name: 'valid-until',
      shorthand: null,
      type: Number,
      deprecated: false,
      description:
        'Absolute expiration time as Unix timestamp in milliseconds (mutually exclusive with --valid-for)',
      argument: 'TIMESTAMP_MS',
    },
    {
      name: 'valid-for',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Relative duration before expiration (for example: 15m, 1h, 7d; mutually exclusive with --valid-until)',
      argument: 'DURATION',
    },
    {
      name: 'allowed-content-type',
      shorthand: null,
      type: [String],
      deprecated: false,
      description:
        'Allowed content type(s) for put operations (repeatable, supports wildcards)',
      argument: 'MIME_TYPE',
    },
    {
      name: 'maximum-size-in-bytes',
      shorthand: null,
      type: Number,
      deprecated: false,
      description: 'Maximum upload size in bytes for put operations (max: 5TB)',
      argument: 'BYTES',
    },
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output signed token payload as JSON',
    },
  ],
  examples: [
    {
      name: 'Issue a signed token for reads',
      value:
        'vercel blob signed-token --pathname media/photo.jpg --operation get',
    },
    {
      name: 'Issue a signed token for uploads with constraints',
      value:
        'vercel blob signed-token --pathname uploads/* --operation put --allowed-content-type image/* --maximum-size-in-bytes 10485760',
    },
  ],
} as const;

export const presignSubcommand = {
  name: 'presign',
  aliases: [],
  description: 'Generate a presigned URL for Blob operations',
  arguments: [
    {
      name: 'pathname',
      required: true,
    },
  ],
  options: [
    accessOption,
    {
      name: 'operation',
      shorthand: 'o',
      type: String,
      deprecated: false,
      description:
        'Operation for the presigned URL: get, head, put, or delete (default: get)',
      argument: 'OPERATION',
      choices: ['get', 'head', 'put', 'delete'],
    },
    {
      name: 'delegation-token',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Delegation token from `vercel blob signed-token` (must be used with --client-signing-token)',
      argument: 'STRING',
    },
    {
      name: 'client-signing-token',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Signing secret/token from `vercel blob signed-token` (must be used with --delegation-token)',
      argument: 'STRING',
    },
    {
      name: 'valid-until',
      shorthand: null,
      type: Number,
      deprecated: false,
      description:
        'Absolute expiration time as Unix timestamp in milliseconds (mutually exclusive with --valid-for)',
      argument: 'TIMESTAMP_MS',
    },
    {
      name: 'valid-for',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Relative duration before expiration (for example: 15m, 1h, 7d; mutually exclusive with --valid-until)',
      argument: 'DURATION',
    },
    {
      name: 'if-match',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'If-Match constraint for put or delete operations',
      argument: 'STRING',
    },
    {
      name: 'allow-overwrite',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Allow overwriting existing blobs (put only)',
    },
    {
      name: 'add-random-suffix',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Add a random suffix to the pathname (put only)',
    },
    {
      name: 'cache-control-max-age',
      shorthand: null,
      type: Number,
      deprecated: false,
      description: 'Cache-Control max-age in seconds (put only)',
      argument: 'SECONDS',
    },
    {
      name: 'allowed-content-type',
      shorthand: null,
      type: [String],
      deprecated: false,
      description: 'Allowed content type(s) for uploads (put only, repeatable)',
      argument: 'MIME_TYPE',
    },
    {
      name: 'maximum-size-in-bytes',
      shorthand: null,
      type: Number,
      deprecated: false,
      description: 'Maximum upload size in bytes (put only, max: 5TB)',
      argument: 'BYTES',
    },
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output presign result as JSON',
    },
  ],
  examples: [
    {
      name: 'Generate a presigned GET URL',
      value: 'vercel blob presign media/photo.jpg --access public',
    },
    {
      name: 'Generate a presigned PUT URL with upload constraints',
      value:
        'vercel blob presign uploads/image.jpg --access private --operation put --allowed-content-type image/* --maximum-size-in-bytes 10485760',
    },
    {
      name: 'Generate a presigned URL from existing signed-token output',
      value:
        'vercel blob presign uploads/image.jpg --access private --operation put --delegation-token <delegationToken> --client-signing-token <clientSigningToken>',
    },
  ],
} as const;

export const createStoreSubcommand = {
  name: 'create-store',
  aliases: [],
  description: 'Create a new Blob store',
  arguments: [
    {
      name: 'name',
      required: false,
    },
  ],
  options: [
    accessOption,
    {
      name: 'region',
      shorthand: 'r',
      type: String,
      deprecated: false,
      description:
        'Region to create the Blob store in (default: "iad1"). See https://vercel.com/docs/edge-network/regions#region-list for all available regions',
      argument: 'STRING',
    },
    yesOption,
    environmentOption,
  ],
  examples: [
    {
      name: 'Create a blob store (uses default region "iad1")',
      value: 'vercel blob create-store my-store --access private',
    },
    {
      name: 'Create a blob store in a specific region',
      value: 'vercel blob create-store my-store --access private --region cdg1',
    },
    {
      name: 'Create and connect to project in CI',
      value:
        'vercel blob create-store my-store --access private --yes --environment production --environment preview',
    },
  ],
} as const;

export const deleteStoreSubcommand = {
  name: 'delete-store',
  aliases: [],
  description: 'Delete a Blob store',
  arguments: [
    {
      name: 'storeId',
      required: false,
    },
  ],
  options: [yesOption],
  examples: [],
} as const;

export const emptyStoreSubcommand = {
  name: 'empty-store',
  aliases: [],
  description: 'Delete all blobs in a Blob store',
  arguments: [],
  options: [yesOption],
  examples: [],
} as const;

export const getStoreInfoSubcommand = {
  name: 'get-store',
  aliases: [],
  description: 'Get a Blob store',
  arguments: [
    {
      name: 'storeId',
      required: false,
    },
  ],
  options: [],
  examples: [],
} as const;

export const listStoresSubcommand = {
  name: 'list-stores',
  aliases: ['ls-stores'],
  description: 'List all Blob stores',
  arguments: [],
  options: [
    {
      name: 'all',
      shorthand: 'a',
      type: Boolean,
      deprecated: false,
      description:
        'List all blob stores for the team, not just the ones connected to the current project',
    },
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output results as JSON',
    },
    {
      name: 'no-projects',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Hide the Projects column (table output only)',
    },
  ],
  examples: [
    {
      name: 'List blob stores for the linked project',
      value: 'vercel blob list-stores',
    },
    {
      name: 'List all team blob stores as JSON',
      value: 'vercel blob list-stores --all --json',
    },
  ],
} as const;

export const blobCommand = {
  name: 'blob',
  aliases: [],
  description: 'Interact with Vercel Blob',
  arguments: [],
  subcommands: [
    listSubcommand,
    putSubcommand,
    getSubcommand,
    delSubcommand,
    copySubcommand,
    signedTokenSubcommand,
    presignSubcommand,
    createStoreSubcommand,
    deleteStoreSubcommand,
    getStoreInfoSubcommand,
    listStoresSubcommand,
    emptyStoreSubcommand,
  ],
  options: [
    {
      name: 'rw-token',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Read_Write_Token for the Blob store',
      argument: 'String',
    },
    {
      name: 'oidc-token',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'OIDC token for the Blob store (must be passed together with --store-id)',
      argument: 'String',
    },
    {
      name: 'store-id',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Blob store id, with or without the "store_" prefix (must be passed together with --oidc-token)',
      argument: 'String',
    },
  ],
  examples: [],
} as const;
