import {
  formatOption,
  jsonOption,
  limitOption,
  projectOption,
  yesOption,
} from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';
import { imageAggregateCommand } from './image/command';
import { permissionsAggregateCommand } from './permissions/command';
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

const platformOption = {
  name: 'platform',
  shorthand: null,
  type: String,
  deprecated: false,
  description: 'Target platform for the build (defaults to linux/amd64).',
  argument: 'PLATFORM',
} as const;

const pushOption = {
  name: 'push',
  shorthand: null,
  type: Boolean,
  deprecated: false,
  description:
    'Push the image after building. With Docker this builds and pushes in one step (Buildx enables zstd compression); Podman and Buildah build, then push with zstd compression.',
} as const;

export const listSubcommand = {
  name: 'ls',
  aliases: ['list'],
  description: 'List container registry repositories for a project',
  arguments: [],
  options: [
    projectScopeOption,
    limitOption,
    cursorOption,
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'List repositories in the linked project',
      value: `${packageName} vcr ls`,
    },
    {
      name: 'List repositories for a specific project as JSON',
      value: `${packageName} vcr ls --project my-app --json`,
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
  options: [projectScopeOption, formatOption, jsonOption],
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
  options: [projectScopeOption, formatOption, jsonOption],
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
  options: [projectScopeOption, yesOption, formatOption, jsonOption],
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
  options: [projectScopeOption, formatOption, jsonOption],
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

export const buildSubcommand = {
  name: 'build',
  aliases: [],
  description:
    'Build a container image tagged for the Vercel Container Registry by shelling out to your container tool (docker, podman, or buildah)',
  arguments: [
    {
      name: 'engine',
      required: true,
    },
    {
      name: 'path',
      required: false,
    },
    {
      name: 'name',
      required: false,
    },
  ],
  options: [projectScopeOption, platformOption, pushOption],
  examples: [
    {
      name: 'Build the current directory into the linked project (repository defaults to the project name, tag to latest)',
      value: `${packageName} vcr build docker`,
    },
    {
      name: 'Build and push in one step (Docker Buildx enables zstd compression)',
      value: `${packageName} vcr build docker --push`,
    },
    {
      name: 'Build a specific context path with a repository and tag',
      value: `${packageName} vcr build docker ./app my-api:1.2.3`,
    },
    {
      name: 'Pass extra flags through to the container tool',
      value: `${packageName} vcr build docker . -- --no-cache --build-arg KEY=value`,
    },
  ],
} as const;

export const pushSubcommand = {
  name: 'push',
  aliases: [],
  description:
    'Push a container image to the Vercel Container Registry by shelling out to your container tool (docker, podman, or buildah)',
  arguments: [
    {
      name: 'engine',
      required: true,
    },
    {
      name: 'name',
      required: false,
    },
  ],
  options: [projectScopeOption],
  examples: [
    {
      name: 'Push the linked project image (repository defaults to the project name, tag to latest)',
      value: `${packageName} vcr push docker`,
    },
    {
      name: 'Push a specific repository and tag',
      value: `${packageName} vcr push docker my-api:1.2.3`,
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
    buildSubcommand,
    pushSubcommand,
    tagsAggregateCommand,
    imageAggregateCommand,
    permissionsAggregateCommand,
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
