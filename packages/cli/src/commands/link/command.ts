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
  runsWithoutSubcommand: true,
  arguments: [],
  subcommands: [addSubcommand],
  options: [
    {
      name: 'repo',
      description:
        'Link multiple projects from the Git repository (alpha; per-directory project links take precedence)',
      shorthand: null,
      deprecatedShorthand: 'r',
      type: Boolean,
      deprecated: false,
    },
    {
      ...projectOption,
      shorthand: 'p',
      description:
        'Set the project name or ID to link; required for non-interactive existing-project links',
    },
    // Hidden: `--team` is the old name of the global `--scope`.
    {
      name: 'team',
      description: 'Deprecated alias for `--scope`',
      shorthand: null,
      argument: 'TEAM_ID_OR_SLUG',
      type: String,
      deprecated: true,
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
      placeholders: ['<TEAM>', '<project-name-or-id>'],
      value: `${packageName} link --yes --scope <TEAM> --project <project-name-or-id>`,
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
