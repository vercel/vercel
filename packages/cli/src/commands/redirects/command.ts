import { packageName } from '../../util/pkg-name';
import {
  jsonOption,
  nextCursorOption,
  projectOption,
  yesOption,
} from '../../util/arg-common';

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description:
    'List all redirects for the current project. These redirects apply to all deployments and environments. There may also be redirects defined in a deployment that are not listed here.',
  arguments: [],
  options: [
    projectOption,
    jsonOption,
    {
      name: 'query',
      description: 'Search for redirects by source or destination',
      shorthand: 'q',
      type: String,
      argument: 'TEXT',
      deprecated: false,
    },
    // Hidden: `--search` and `-s` are the old names of `--query`.
    {
      name: 'search',
      description: 'Deprecated alias for `--query`',
      shorthand: 's',
      type: String,
      argument: 'QUERY',
      deprecated: true,
    },
    nextCursorOption,
    {
      name: 'limit',
      description: 'Number of redirects per page (default: 50)',
      shorthand: 'n',
      type: Number,
      argument: 'NUMBER',
      deprecated: false,
    },
    {
      name: 'page',
      description: 'Page number to display',
      shorthand: null,
      type: Number,
      argument: 'NUMBER',
      deprecated: true,
    },
    {
      name: 'per-page',
      description: 'Number of redirects per page (default: 50)',
      shorthand: null,
      type: Number,
      argument: 'NUMBER',
      deprecated: true,
    },
    {
      name: 'staging',
      description: 'List redirects from the staging version',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'redirects-version',
      description: 'List redirects from a specific version',
      shorthand: null,
      type: String,
      argument: 'VERSION',
      deprecated: false,
    },
    // Hidden: `--version` never picked a version. `vercel` reads it as its
    // own `--version` flag before this command runs, so the value is dropped.
    {
      name: 'version',
      description: 'Use `--redirects-version`',
      shorthand: null,
      type: String,
      argument: 'VERSION_ID',
      deprecated: true,
    },
  ],
  examples: [
    {
      name: 'List all redirects',
      value: `${packageName} redirects list`,
    },
    {
      name: 'Search for redirects',
      value: `${packageName} redirects list --query "/old-path"`,
    },
    {
      name: 'List redirects on page 2',
      placeholders: ['<CURSOR>'],
      value: `${packageName} redirects list --next <CURSOR>`,
    },
    {
      name: 'List redirects with custom page size',
      value: `${packageName} redirects list --limit 25`,
    },
  ],
} as const;

export const listVersionsSubcommand = {
  name: 'list-versions',
  aliases: ['ls-versions'],
  description: 'List all versions of redirects',
  arguments: [],
  options: [projectOption, jsonOption],
  examples: [
    {
      name: 'List all redirect versions',
      value: `${packageName} redirects list-versions`,
    },
  ],
} as const;

export const addSubcommand = {
  name: 'add',
  aliases: [],
  description: 'Add a new redirect',
  arguments: [
    {
      name: 'source',
      required: false,
    },
    {
      name: 'destination',
      required: false,
    },
  ],
  options: [
    projectOption,
    {
      name: 'status',
      description: 'HTTP status code (301, 302, 307, or 308)',
      shorthand: null,
      type: Number,
      argument: 'CODE',
      deprecated: false,
    },
    {
      name: 'case-sensitive',
      description: 'Make the redirect case sensitive',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'preserve-query-params',
      description: 'Preserve query parameters when redirecting',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'name',
      description: 'Version name for this redirect (max 256 characters)',
      shorthand: null,
      type: String,
      argument: 'NAME',
      deprecated: false,
    },
    {
      ...yesOption,
      description: 'Skip prompts and use default values',
    },
  ],
  examples: [
    {
      name: 'Add a new redirect interactively',
      value: `${packageName} redirects add`,
    },
    {
      name: 'Add a new redirect with arguments',
      value: `${packageName} redirects add /old-path /new-path`,
    },
    {
      name: 'Add a redirect with all options',
      value: `${packageName} redirects add /old-path /new-path --status 301 --case-sensitive --preserve-query-params --name "My redirect"`,
    },
    {
      name: 'Add a redirect non-interactively',
      value: `${packageName} redirects add /old-path /new-path --yes`,
    },
  ],
} as const;

export const uploadSubcommand = {
  name: 'import',
  aliases: ['upload'],
  description: 'Import redirects from a CSV or JSON file',
  arguments: [
    {
      name: 'file',
      required: true,
    },
  ],
  options: [
    projectOption,
    {
      ...yesOption,
      description: 'Skip confirmation prompt',
    },
    {
      name: 'force',
      description: 'Replace all existing redirects',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    // Hidden: `--overwrite` is the old name of `--force`.
    {
      name: 'overwrite',
      description: 'Deprecated alias for `--force`',
      shorthand: null,
      type: Boolean,
      deprecated: true,
    },
  ],
  examples: [
    {
      name: 'Import redirects from CSV file',
      value: `${packageName} redirects import redirects.csv`,
    },
    {
      name: 'Import redirects from JSON file',
      value: `${packageName} redirects import redirects.json`,
    },
    {
      name: 'Import and overwrite existing redirects',
      value: `${packageName} redirects import redirects.csv --force`,
    },
    {
      name: 'Import without confirmation',
      value: `${packageName} redirects import redirects.csv --yes`,
    },
  ],
} as const;

export const removeSubcommand = {
  name: 'remove',
  aliases: ['rm'],
  description: 'Remove a redirect',
  arguments: [
    {
      name: 'source',
      required: true,
    },
  ],
  options: [
    projectOption,
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when removing a redirect',
    },
  ],
  examples: [
    {
      name: 'Remove a redirect',
      value: `${packageName} redirects remove /old-path`,
    },
  ],
} as const;

export const promoteSubcommand = {
  name: 'promote',
  aliases: [],
  description: 'Promote a staged redirects version to production',
  arguments: [
    {
      name: 'version-id',
      required: true,
    },
  ],
  options: [
    projectOption,
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when promoting',
    },
  ],
  examples: [
    {
      name: 'Promote a redirect version',
      placeholders: ['<version-id>'],
      value: `${packageName} redirects promote <version-id>`,
    },
  ],
} as const;

export const restoreSubcommand = {
  name: 'restore',
  aliases: [],
  description: 'Restore a previous redirects version',
  arguments: [
    {
      name: 'version-id',
      required: true,
    },
  ],
  options: [
    projectOption,
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when restoring',
    },
  ],
  examples: [
    {
      name: 'Restore a redirects version',
      placeholders: ['<version-id>'],
      value: `${packageName} redirects restore <version-id>`,
    },
  ],
} as const;

export const redirectsCommand = {
  descriptionTone: 'normal',
  name: 'redirects',
  aliases: ['redirect'],
  description:
    'Manage redirects for a project. Redirects managed at the project level apply to all deployments and environments and take effect immediately after being created and promoted to production.',
  arguments: [],
  subcommands: [
    listSubcommand,
    listVersionsSubcommand,
    addSubcommand,
    uploadSubcommand,
    removeSubcommand,
    promoteSubcommand,
    restoreSubcommand,
  ],
  options: [],
  examples: [],
} as const;
