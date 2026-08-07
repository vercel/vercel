import { packageName } from '../../util/pkg-name';
import { confirmOption, projectOption, yesOption } from '../../util/arg-common';

export const addSubcommand = {
  name: 'add',
  aliases: [],
  description:
    'Add projects to an existing repository link created by link --repo',
  arguments: [],
  options: [
    {
      ...yesOption,
      description:
        'Skip questions when adding projects with default team and settings',
    },
  ],
  examples: [
    {
      name: 'Add projects to an existing repository link',
      value: `${packageName} link add`,
    },
  ],
} as const;

export const linkCommand = {
  name: 'link',
  aliases: [],
  description: 'Link a local directory to a Vercel project',
  arguments: [],
  subcommands: [addSubcommand],
  options: [
    {
      name: 'repo',
      description: 'Link multiple projects from the Git repository (alpha)',
      shorthand: 'r',
      type: Boolean,
      deprecated: false,
    },
    {
      ...projectOption,
      shorthand: 'p',
      description:
        'Set the project name or ID to link; required for non-interactive existing-project links',
    },
    {
      name: 'team',
      description:
        'Set the team ID or slug; use with --project for non-interactive links',
      shorthand: null,
      argument: 'TEAM_ID_OR_SLUG',
      type: String,
      deprecated: false,
    },
    {
      ...yesOption,
      description:
        'Skip questions when setting up with default team and settings',
    },
    confirmOption,
  ],
  examples: [
    {
      name: 'Link current directory to a Vercel project',
      value: `${packageName} link`,
    },
    {
      name: 'Link current directory with default options and skip questions',
      value: `${packageName} link --yes`,
    },
    {
      name: 'Link to an existing project in CI or agent mode',
      value: `${packageName} link --yes --team <team-id> --project <project-name-or-id>`,
    },
    {
      name: 'Link a specific directory to a Vercel project',
      value: `${packageName} link --cwd /path/to/project`,
    },
    {
      name: 'Link multiple projects from the current Git repository',
      value: `${packageName} link --repo`,
    },
    {
      name: 'Add additional projects to an existing repository link',
      value: `${packageName} link add`,
    },
  ],
} as const;
