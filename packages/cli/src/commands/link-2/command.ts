import { packageName } from '../../util/pkg-name';
import { confirmOption, yesOption } from '../../util/arg-common';

export const addSubcommand = {
  name: 'add',
  aliases: [],
  description:
    'Add additional Vercel Projects to an existing repository link. Requires an existing repo.json (created by `link-2`).',
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
      value: `${packageName} link-2 add`,
    },
  ],
} as const;

export const link2Command = {
  name: 'link-2',
  aliases: [],
  description: 'Link a local directory to a Vercel Project (unified flow).',
  arguments: [],
  subcommands: [addSubcommand],
  options: [
    {
      name: 'repo',
      description: 'Link multiple projects based on Git repository (alpha)',
      shorthand: 'r',
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'project',
      description:
        'Project name or ID to link to (required for non-interactive)',
      shorthand: 'p',
      argument: 'NAME_OR_ID',
      type: String,
      deprecated: false,
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
      value: `${packageName} link-2`,
    },
    {
      name: 'Link current directory with default options and skip questions',
      value: `${packageName} link-2 --yes`,
    },
    {
      name: 'Non-interactive: link to an existing project (CI/agents)',
      value: `${packageName} link-2 --yes --team <team-id> --project <project-name-or-id>`,
    },
    {
      name: 'Link a specific directory to a Vercel Project',
      value: `${packageName} link-2 --cwd /path/to/project`,
    },
    {
      name: 'Link to the current Git repository, allowing for multiple Vercel Projects to be linked simultaneously (useful for monorepos)',
      value: `${packageName} link-2 --repo`,
    },
    {
      name: 'Add additional projects to an existing repository link',
      value: `${packageName} link-2 add`,
    },
  ],
} as const;
