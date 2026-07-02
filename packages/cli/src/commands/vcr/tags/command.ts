import {
  formatOption,
  limitOption,
  projectOption,
} from '../../../util/arg-common';
import { packageName } from '../../../util/pkg-name';

const projectScopeOption = {
  ...projectOption,
  shorthand: 'p',
  description: 'Project name or ID (defaults to the linked project).',
} as const;

const cursorOption = {
  name: 'cursor',
  shorthand: 'c',
  type: String,
  deprecated: false,
  description: 'Cursor from a previous page to continue listing from',
  argument: 'STRING',
} as const;

export const TAGS_SORT_BY_CHOICES = ['updatedAt', 'tag'] as const;
export const TAGS_SORT_ORDER_CHOICES = ['asc', 'desc'] as const;

export const tagsLsSubcommand = {
  name: 'ls',
  aliases: ['list'],
  description: "List a repository's tags",
  arguments: [
    {
      name: 'repository',
      required: true,
    },
  ],
  options: [
    projectScopeOption,
    {
      name: 'sort-by',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Field to sort tags by (default: updatedAt)',
      argument: 'FIELD',
      choices: TAGS_SORT_BY_CHOICES,
    },
    {
      name: 'sort-order',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Sort direction (default: desc)',
      argument: 'ORDER',
      choices: TAGS_SORT_ORDER_CHOICES,
    },
    limitOption,
    cursorOption,
    formatOption,
  ],
  examples: [
    {
      name: "List a repository's tags",
      value: `${packageName} vcr tag ls my-app`,
    },
  ],
} as const;

export const tagsInspectSubcommand = {
  name: 'inspect',
  aliases: ['get'],
  description: 'Show details for a single tag',
  arguments: [
    {
      name: 'repository',
      required: true,
    },
    {
      name: 'tag',
      required: true,
    },
  ],
  options: [projectScopeOption, formatOption],
  examples: [
    {
      name: 'Inspect a tag by name',
      value: `${packageName} vcr tag inspect my-app latest`,
    },
  ],
} as const;

/**
 * Umbrella command used only for help output of the nested `vcr tag` group.
 * Routing happens in `tags/index.ts` via `getSubcommand`.
 */
export const tagsAggregateCommand = {
  name: 'tag',
  aliases: ['tags'],
  description: "List or inspect a repository's tags",
  arguments: [],
  subcommands: [tagsLsSubcommand, tagsInspectSubcommand],
  options: [],
  examples: [],
} as const;
