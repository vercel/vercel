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
  description: 'Access level for the blob: public or private (default: public)',
  argument: 'String',
  choices: ['public', 'private'],
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
    {
      name: 'force',
      shorthand: 'f',
      type: Boolean,
      deprecated: true,
      description:
        'Overwrite the file if it already exists (deprecated, use --allow-overwrite)',
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

export const addStoreSubcommand = {
  name: 'add',
  aliases: [],
  description: 'Add a new Blob store',
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
  ],
  examples: [
    {
      name: 'Create a blob store (uses default region "iad1")',
      value: 'vercel blob store add my-store',
    },
    {
      name: 'Create a blob store in a specific region',
      value: 'vercel blob store add my-store --region cdg1',
    },
    {
      name: 'Create a private blob store',
      value: 'vercel blob store add my-private-store --access private',
    },
  ],
} as const;

export const removeStoreSubcommand = {
  name: 'remove',
  aliases: ['rm'],
  description: 'Remove a Blob store',
  arguments: [
    {
      name: 'storeId',
      required: false,
    },
  ],
  options: [],
  examples: [],
} as const;

export const getStoreSubcommand = {
  name: 'get',
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
  ],
  examples: [
    {
      name: 'Create a blob store (uses default region "iad1")',
      value: 'vercel blob create-store my-store',
    },
    {
      name: 'Create a blob store in a specific region',
      value: 'vercel blob create-store my-store --region cdg1',
    },
    {
      name: 'Create a private blob store',
      value: 'vercel blob create-store my-private-store --access private',
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
  options: [],
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

export const storeSubcommand = {
  name: 'store',
  aliases: [],
  description: 'Manage or create a Blob store',
  arguments: [],
  subcommands: [addStoreSubcommand, removeStoreSubcommand, getStoreSubcommand],
  options: [],
  examples: [],
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
    createStoreSubcommand,
    deleteStoreSubcommand,
    getStoreInfoSubcommand,
    storeSubcommand,
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
  ],
  examples: [],
} as const;
