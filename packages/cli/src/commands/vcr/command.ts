import {
  formatOption,
  limitOption,
  projectOption,
  yesOption,
} from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';
import { imageAggregateCommand } from './image/command';
import { tagsAggregateCommand } from './tags/command';

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

export const listSubcommand = {
  name: 'ls',
  aliases: ['list'],
  description: 'List container registry repositories for a project',
  arguments: [],
  options: [projectScopeOption, limitOption, cursorOption, formatOption],
  examples: [
    {
      name: 'List repositories in the linked project',
      value: `${packageName} vcr ls`,
    },
    {
      name: 'List repositories for a specific project as JSON',
      value: `${packageName} vcr ls --project my-app --format json`,
    },
  ],
} as const;

export const inspectSubcommand = {
  name: 'inspect',
  aliases: ['get'],
  description: 'Show details for a single repository',
  arguments: [
    {
      name: 'repository',
      required: true,
    },
  ],
  options: [projectScopeOption, formatOption],
  examples: [
    {
      name: 'Inspect a repository by name',
      value: `${packageName} vcr inspect my-repository`,
    },
  ],
} as const;

export const addSubcommand = {
  name: 'add',
  aliases: ['create'],
  description: 'Create a container registry repository',
  arguments: [
    {
      name: 'name',
      required: true,
    },
  ],
  options: [projectScopeOption, formatOption],
  examples: [
    {
      name: 'Create a repository',
      value: `${packageName} vcr add my-repository`,
    },
  ],
} as const;

export const removeSubcommand = {
  name: 'rm',
  aliases: ['remove', 'delete'],
  description: 'Delete a container registry repository',
  arguments: [
    {
      name: 'repository',
      required: true,
    },
  ],
  options: [projectScopeOption, yesOption, formatOption],
  examples: [
    {
      name: 'Delete a repository',
      value: `${packageName} vcr rm my-repository`,
    },
    {
      name: 'Delete a repository without the confirmation prompt',
      value: `${packageName} vcr rm my-repository --yes`,
    },
  ],
} as const;

export const loginSubcommand = {
  name: 'login',
  aliases: [],
  description:
    'Authenticate a container tool (docker, podman, or buildah) with the Vercel Container Registry',
  arguments: [
    {
      name: 'engine',
      required: true,
    },
  ],
  options: [projectScopeOption, formatOption],
  examples: [
    {
      name: 'Log in with Docker',
      value: `${packageName} vcr login docker`,
    },
    {
      name: 'Log in with Podman',
      value: `${packageName} vcr login podman`,
    },
    {
      name: 'Log in with Buildah',
      value: `${packageName} vcr login buildah`,
    },
    {
      name: 'Log in for a specific project',
      value: `${packageName} vcr login docker --project my-app`,
    },
  ],
} as const;

export const vcrCommand = {
  name: 'vcr',
  aliases: [],
  description:
    'Manage Vercel Container Registry repositories and images (see `vcr image`).',
  arguments: [],
  subcommands: [
    listSubcommand,
    inspectSubcommand,
    addSubcommand,
    removeSubcommand,
    loginSubcommand,
    tagsAggregateCommand,
    imageAggregateCommand,
  ],
  options: [],
  examples: [
    {
      name: 'List repositories in the linked project',
      value: `${packageName} vcr ls`,
    },
    {
      name: 'Create a repository',
      value: `${packageName} vcr add my-app`,
    },
    {
      name: 'List images in a repository',
      value: `${packageName} vcr image ls my-app`,
    },
  ],
} as const;
