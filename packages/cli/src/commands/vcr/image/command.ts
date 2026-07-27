import {
  formatOption,
  limitOption,
  projectOption,
  yesOption,
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

export const imageLsSubcommand = {
  name: 'ls',
  aliases: ['list'],
  description: 'List images in a container registry repository',
  arguments: [
    {
      name: 'repository',
      required: true,
    },
  ],
  options: [
    projectScopeOption,
    {
      name: 'untagged',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Only list images that have no tags',
    },
    limitOption,
    cursorOption,
    formatOption,
  ],
  examples: [
    {
      name: 'List images in a repository',
      value: `${packageName} vcr image ls my-app`,
    },
    {
      name: 'List untagged images as JSON',
      value: `${packageName} vcr image ls my-app --untagged --format json`,
    },
  ],
} as const;

export const imageInspectSubcommand = {
  name: 'inspect',
  aliases: ['get'],
  description: 'Show details for a single image, including its layer history',
  arguments: [
    {
      name: 'repository',
      required: true,
    },
    {
      name: 'imageId',
      required: true,
    },
  ],
  options: [projectScopeOption, formatOption],
  examples: [
    {
      name: 'Inspect an image by id',
      value: `${packageName} vcr image inspect my-app img_abc123`,
    },
  ],
} as const;

export const imageRmSubcommand = {
  name: 'rm',
  aliases: ['remove', 'delete'],
  description: 'Delete an image from a repository',
  arguments: [
    {
      name: 'repository',
      required: true,
    },
    {
      name: 'imageId',
      required: true,
    },
  ],
  options: [projectScopeOption, yesOption, formatOption],
  examples: [
    {
      name: 'Delete an image by id',
      value: `${packageName} vcr image rm my-app img_abc123`,
    },
    {
      name: 'Delete an image without the confirmation prompt',
      value: `${packageName} vcr image rm my-app img_abc123 --yes`,
    },
  ],
} as const;

/**
 * Umbrella command used only for help output of the nested `vcr image` group.
 * Routing happens in `image/index.ts` via `getSubcommand`.
 */
export const imageAggregateCommand = {
  name: 'image',
  aliases: ['images'],
  description: 'List, inspect, or delete images in a repository',
  arguments: [],
  subcommands: [imageLsSubcommand, imageInspectSubcommand, imageRmSubcommand],
  options: [],
  examples: [],
} as const;
