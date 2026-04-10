import { packageName } from '../../util/pkg-name';
import { confirmOption, yesOption } from '../../util/arg-common';

export const addSubcommand = {
  name: 'add',
  aliases: [],
  description:
    'Add projects to the repository link: connect existing Vercel projects that are not yet linked to this Git remote, create new projects from local detection, and fix root directories. Requires repo.json from `link --repo`.',
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

export const linkCommand = {
  name: 'link',
  aliases: [],
  description: 'Link a local directory to a Vercel Project.',
  arguments: [],
  subcommands: [addSubcommand],
  options: [
    {
      name: 'repo',
      description:
        'Link this Git repository to Vercel projects already connected to this remote (alpha). Use `link add` to connect more projects or create new ones.',
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
      name: 'Record which Vercel projects are already linked to this Git repository (monorepos)',
      value: `${packageName} link --repo`,
    },
    {
      name: 'Add additional projects to an existing repository link',
      value: `${packageName} link add`,
    },
  ],
} as const;
