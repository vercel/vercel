import { packageName } from '../../util/pkg-name';
import {
  formatOption,
  limitOption,
  projectOption,
  yesOption,
} from '../../util/arg-common';

// -p override has precedent (`activity`, `logs`). Singular on purpose: the
// API accepts arrays, but a multi-project inbox is a feature nobody asked for.
const commentsProjectOption = {
  ...projectOption,
  shorthand: 'p',
  description: 'Project ID or name (defaults to the linked project)',
} as const;

// Deliberate divergence, documented in the plan: the repo uses -m for --meta
// elsewhere; we take it for `git commit -m` muscle memory.
const messageContentOption = {
  name: 'message',
  shorthand: 'm',
  type: String,
  argument: 'TEXT',
  deprecated: false,
  description: 'Markdown message content',
} as const;

const fileOption = {
  name: 'file',
  shorthand: null,
  type: String,
  argument: 'PATH',
  deprecated: false,
  description: 'Read Markdown content from a file; use `-` for stdin',
} as const;

const attachOption = {
  name: 'attach',
  shorthand: null,
  type: [String],
  argument: 'URL',
  deprecated: false,
  description: 'Attach a file by https URL (repeatable, max 10)',
} as const;

// Local String cursor option on purpose: the shared `nextOption` is
// `type: Number` (timestamp pagination) and would NaN an opaque cursor.
const nextCursorOption = {
  name: 'next',
  shorthand: 'N',
  type: String,
  argument: 'CURSOR',
  deprecated: false,
  description: 'Show the next page using the cursor from the previous output',
} as const;

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  default: true,
  description: 'List comments for a project',
  arguments: [],
  options: [
    commentsProjectOption,
    {
      name: 'branch',
      shorthand: null,
      type: [String],
      argument: 'BRANCH',
      deprecated: false,
      description:
        'Filter by Git branch (repeatable; defaults to the current branch when inferable)',
    },
    {
      name: 'all-branches',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Show comments from every branch',
    },
    {
      name: 'status',
      shorthand: null,
      type: String,
      argument: 'STATUS',
      deprecated: false,
      description: 'unresolved (default), resolved, or all',
    },
    {
      name: 'page',
      shorthand: null,
      type: [String],
      argument: 'PATH',
      deprecated: false,
      description:
        'Filter by recorded page path or glob (repeatable). Note: rewrites may record a different path than the browser URL',
    },
    {
      name: 'author',
      shorthand: null,
      type: [String],
      argument: 'USER',
      deprecated: false,
      description: 'Filter by author user ID, or `me` (repeatable)',
    },
    {
      name: 'content-id',
      shorthand: null,
      type: [String],
      argument: 'ID',
      deprecated: false,
      description: 'Filter by CMS content ID (repeatable)',
    },
    {
      name: 'search',
      shorthand: null,
      type: String,
      argument: 'TEXT',
      deprecated: false,
      description: 'Search comment content',
    },
    limitOption,
    nextCursorOption,
    formatOption,
  ],
  examples: [
    {
      name: 'List unresolved comments for the linked project',
      value: `${packageName} comments`,
    },
    {
      name: 'List comments on every branch',
      value: `${packageName} comments --all-branches --status all`,
    },
    {
      name: 'List comments as JSON',
      value: `${packageName} comments --format json | jq '.threads[].id'`,
    },
  ],
} as const;

export const inspectSubcommand = {
  name: 'inspect',
  aliases: ['get'],
  description: 'Show a comment thread with its full conversation',
  arguments: [{ name: 'thread', required: false }],
  options: [
    commentsProjectOption,
    {
      name: 'context',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Include framework and device context',
    },
    formatOption,
  ],
  examples: [
    {
      name: 'Inspect a comment thread',
      value: `${packageName} comments inspect icZ9BnPPINuK`,
    },
    {
      name: 'Inspect a comment from its URL',
      value: `${packageName} comments inspect https://vercel.com/team/project/c/icZ9BnPPINuK`,
    },
    {
      name: 'Pick a comment interactively',
      value: `${packageName} comments inspect`,
    },
    {
      name: 'Inspect a thread whose ID starts with a dash',
      value: `${packageName} comments inspect -- -ULOL`,
    },
  ],
} as const;

export const openSubcommand = {
  name: 'open',
  aliases: [],
  description: 'Open a comment thread on vercel.com',
  arguments: [{ name: 'thread', required: true }],
  options: [commentsProjectOption],
  examples: [
    {
      name: 'Open a comment in the browser',
      value: `${packageName} comments open icZ9BnPPINuK`,
    },
  ],
} as const;

export const replySubcommand = {
  name: 'reply',
  aliases: [],
  description: 'Reply to a comment thread',
  arguments: [{ name: 'thread', required: true }],
  options: [
    commentsProjectOption,
    messageContentOption,
    fileOption,
    attachOption,
    formatOption,
  ],
  examples: [
    {
      name: 'Reply to a comment',
      value: `${packageName} comments reply icZ9BnPPINuK -m 'Fixed in **main**.'`,
    },
    {
      name: 'Reply from stdin',
      value: `git log -1 --format=%s | ${packageName} comments reply icZ9BnPPINuK`,
    },
  ],
} as const;

export const resolveSubcommand = {
  name: 'resolve',
  aliases: [],
  description: 'Resolve comment threads, optionally with a closing reply',
  arguments: [{ name: 'thread', required: true, multiple: true }],
  options: [
    commentsProjectOption,
    messageContentOption,
    yesOption,
    formatOption,
  ],
  examples: [
    {
      name: 'Resolve a comment',
      value: `${packageName} comments resolve icZ9BnPPINuK`,
    },
    {
      name: 'Reply and resolve in one step',
      value: `${packageName} comments resolve icZ9BnPPINuK -m 'Fixed in the latest deployment'`,
    },
  ],
} as const;

export const reopenSubcommand = {
  name: 'reopen',
  aliases: [],
  description: 'Reopen resolved comment threads',
  arguments: [{ name: 'thread', required: true, multiple: true }],
  options: [commentsProjectOption, yesOption, formatOption],
  examples: [
    {
      name: 'Reopen a comment',
      value: `${packageName} comments reopen icZ9BnPPINuK`,
    },
  ],
} as const;

export const editSubcommand = {
  name: 'edit',
  aliases: [],
  description: 'Edit a comment message',
  arguments: [
    { name: 'thread', required: true },
    { name: 'message-id', required: true },
  ],
  options: [
    commentsProjectOption,
    messageContentOption,
    fileOption,
    formatOption,
  ],
  examples: [
    {
      name: 'Edit a message',
      value: `${packageName} comments edit icZ9BnPPINuK VvkhYF6dTqbpm7K -m 'Updated wording'`,
    },
  ],
} as const;

export const deleteSubcommand = {
  name: 'delete',
  aliases: [],
  description: 'Delete a comment message',
  arguments: [
    { name: 'thread', required: true },
    { name: 'message-id', required: true },
  ],
  options: [commentsProjectOption, yesOption, formatOption],
  examples: [
    {
      name: 'Delete a message',
      value: `${packageName} comments delete icZ9BnPPINuK VvkhYF6dTqbpm7K`,
    },
  ],
} as const;

export const commentsCommand = {
  name: 'comments',
  aliases: [],
  description:
    'Review and act on Vercel Toolbar comments from the command line',
  arguments: [],
  subcommands: [
    listSubcommand,
    inspectSubcommand,
    openSubcommand,
    replySubcommand,
    resolveSubcommand,
    reopenSubcommand,
    editSubcommand,
    deleteSubcommand,
  ],
  options: [],
  examples: [
    {
      name: 'Review unresolved comments for the linked project',
      value: `${packageName} comments`,
    },
    {
      name: 'Inspect a comment and reply',
      value: `${packageName} comments inspect icZ9BnPPINuK`,
    },
    {
      name: 'Reply and resolve in one step',
      value: `${packageName} comments resolve icZ9BnPPINuK -m 'Fixed!'`,
    },
  ],
} as const;
