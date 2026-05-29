import { packageName } from '../../util/pkg-name';
import {
  confirmOption,
  jsonOption,
  projectOption,
  yesOption,
} from '../../util/arg-common';

export const addSubcommand = {
  name: 'add',
  aliases: [],
  description:
    'Add additional Vercel Projects to an existing repository link. Requires an existing repo.json (created by `link --repo`).',
  arguments: [],
  options: [
    {
      ...yesOption,
      description:
        'Skip questions when adding projects using default scope and settings',
    },
  ],
  examples: [
    {
      name: 'Add projects to an existing repository link',
      value: `${packageName} link add`,
    },
  ],
} as const;

export const inspectSubcommand = {
  name: 'inspect',
  aliases: [],
  description:
    'Inspect whether the current directory is linked to a Vercel Project.',
  arguments: [],
  options: [
    {
      ...jsonOption,
      deprecated: false,
      description: 'Print link information as JSON',
    },
  ],
  examples: [
    {
      name: 'Inspect the current directory link',
      value: `${packageName} link inspect`,
    },
    {
      name: 'Inspect the current directory link as JSON',
      value: `${packageName} link inspect --json`,
    },
  ],
} as const;

export const linkCommand = {
  name: 'link',
  aliases: [],
  description: 'Link a local directory to a Vercel Project.',
  arguments: [],
  subcommands: [addSubcommand, inspectSubcommand],
  options: [
    {
      name: 'repo',
      description: 'Link multiple projects based on Git repository (alpha)',
      shorthand: 'r',
      type: Boolean,
      deprecated: false,
    },
    {
      ...projectOption,
      shorthand: 'p',
      description:
        'Project name or ID to link to (required for non-interactive)',
    },
    {
      name: 'team',
      description:
        'Scope: team ID or slug (use with --project for non-interactive)',
      shorthand: null,
      argument: 'TEAM_ID_OR_SLUG',
      type: String,
      deprecated: false,
    },
    {
      ...yesOption,
      description:
        'Skip questions when setting up new project using default scope and settings',
    },
    confirmOption,
  ],
  examples: [
    {
      name: 'Link current directory to a Vercel Project',
      value: `${packageName} link`,
    },
    {
      name: 'Link current directory with default options and skip questions',
      value: `${packageName} link --yes`,
    },
    {
      name: 'Non-interactive: link to an existing project (CI/agents)',
      value: `${packageName} link --yes --team <team-id> --project <project-name-or-id>`,
    },
    {
      name: 'Link a specific directory to a Vercel Project',
      value: `${packageName} link --cwd /path/to/project`,
    },
    {
      name: 'Link to the current Git repository, allowing for multiple Vercel Projects to be linked simultaneously (useful for monorepos)',
      value: `${packageName} link --repo`,
    },
    {
      name: 'Add additional projects to an existing repository link',
      value: `${packageName} link add`,
    },
    {
      name: 'Inspect the current directory link',
      value: `${packageName} link inspect`,
    },
  ],
} as const;
