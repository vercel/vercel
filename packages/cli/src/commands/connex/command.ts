import { formatOption, yesOption } from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

export const createSubcommand = {
  name: 'create',
  aliases: [],
  description: 'Create a new Connex connector',
  arguments: [
    {
      name: 'type',
      required: true,
    },
  ],
  options: [
    {
      name: 'name',
      shorthand: 'n',
      type: String,
      argument: 'NAME',
      deprecated: false,
      description: 'Name of the Connex connector',
    },
    {
      name: 'triggers',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Enable webhook triggers for this connector',
    },
    formatOption,
  ],
  examples: [
    {
      name: 'Create a Slack app',
      value: `${packageName} connex create slack`,
    },
    {
      name: 'Create with a custom name',
      value: `${packageName} connex create slack --name my-bot`,
    },
    {
      name: 'Create with webhook triggers enabled',
      value: `${packageName} connex create slack --name my-bot --triggers`,
    },
    {
      name: 'Output as JSON',
      value: `${packageName} connex create slack --format=json`,
    },
  ],
} as const;

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description:
    'List Connex connectors linked to the current project (falls back to every connector in the team when no project is linked or when --all-projects is set)',
  arguments: [],
  options: [
    {
      name: 'all-projects',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'List every Connex connector in the team, regardless of project link',
    },
    {
      name: 'limit',
      shorthand: null,
      type: Number,
      argument: 'COUNT',
      deprecated: false,
      description: 'Number of connectors to return per page',
    },
    {
      name: 'next',
      shorthand: null,
      type: String,
      argument: 'CURSOR',
      deprecated: false,
      description: 'Cursor for the next page of results',
    },
    formatOption,
  ],
  examples: [
    {
      name: 'List Connex connectors linked to the current project',
      value: `${packageName} connex list`,
    },
    {
      name: 'List every Connex connector in the team',
      value: `${packageName} connex list --all-projects`,
    },
    {
      name: 'Limit the number of results',
      value: `${packageName} connex list --limit 10`,
    },
    {
      name: 'Fetch the next page of results',
      value: `${packageName} connex list --next <cursor>`,
    },
    {
      name: 'Output as JSON',
      value: `${packageName} connex list --format=json`,
    },
  ],
} as const;

export const removeSubcommand = {
  name: 'remove',
  aliases: ['rm'],
  description: 'Delete a Connex connector',
  arguments: [
    {
      name: 'client',
      required: true,
    },
  ],
  options: [
    {
      name: 'disconnect-all',
      description:
        'Disconnects all projects from the connector before deletion',
      shorthand: 'a',
      type: Boolean,
      deprecated: false,
    },
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when deleting a connector',
    },
    formatOption,
  ],
  examples: [
    {
      name: 'Delete a Connex connector by ID',
      value: `${packageName} connex remove scl_abc123`,
    },
    {
      name: 'Delete a Connex connector by UID',
      value: `${packageName} connex remove slack/my-bot`,
    },
    {
      name: 'Disconnect all projects from a connector, then delete it',
      value: [
        `${packageName} connex remove scl_abc123 --disconnect-all`,
        `${packageName} connex remove slack/my-bot -a`,
      ],
    },
    {
      name: 'Skip the confirmation prompt',
      value: `${packageName} connex remove scl_abc123 --yes`,
    },
    {
      name: 'Output as JSON',
      value: `${packageName} connex remove scl_abc123 --format=json --yes`,
    },
  ],
} as const;

export const tokenSubcommand = {
  name: 'token',
  aliases: [],
  description:
    'Get a token for a Connex connector (accepts a connector ID like scl_abc or a UID like slack/my-bot)',
  arguments: [
    {
      name: 'id',
      required: true,
    },
  ],
  options: [
    {
      name: 'subject',
      shorthand: 's',
      type: String,
      argument: 'TYPE',
      deprecated: false,
      description:
        'Subject type: "user" (default, acts on behalf of you) or "app" (uses the connector\'s default installation)',
    },
    {
      name: 'installation-id',
      shorthand: null,
      type: String,
      argument: 'ID',
      deprecated: false,
      description:
        "Target a specific installation (only useful with --subject app; defaults to the connector's default installation)",
    },
    {
      name: 'scopes',
      shorthand: null,
      type: String,
      argument: 'SCOPES',
      deprecated: false,
      description: 'Scopes (comma- or space-separated)',
    },
    yesOption,
    formatOption,
  ],
  examples: [
    {
      name: 'Get a user token by connector ID',
      value: `${packageName} connex token scl_abc123`,
    },
    {
      name: 'Get a token by connector UID',
      value: `${packageName} connex token slack/my-bot`,
    },
    {
      name: 'Get an app token (default installation)',
      value: `${packageName} connex token scl_abc123 --subject app`,
    },
    {
      name: 'Get an app token for a specific installation',
      value: `${packageName} connex token scl_abc123 --subject app --installation-id inst_1`,
    },
    {
      name: 'Open the browser automatically if authorization/installation is required',
      value: `${packageName} connex token scl_abc123 --yes`,
    },
    {
      name: 'Output as JSON (includes expiresAt, installationId, etc.)',
      value: `${packageName} connex token scl_abc123 --format=json`,
    },
  ],
} as const;

export const openSubcommand = {
  name: 'open',
  aliases: [],
  description: 'Open a Connex connector in the Vercel dashboard',
  arguments: [
    {
      name: 'id',
      required: true,
    },
  ],
  options: [formatOption],
  examples: [
    {
      name: 'Open a connector by ID',
      value: `${packageName} connex open scl_abc123`,
    },
    {
      name: 'Open a connector by UID',
      value: `${packageName} connex open slack/my-bot`,
    },
    {
      name: 'Print the dashboard URL as JSON',
      value: `${packageName} connex open scl_abc123 --format=json`,
    },
  ],
} as const;

export const attachSubcommand = {
  name: 'attach',
  aliases: [],
  description:
    'Attach a Vercel project to a Connex connector for one or more environments',
  arguments: [
    {
      name: 'client',
      required: true,
    },
  ],
  options: [
    {
      name: 'environment',
      shorthand: 'e',
      type: [String],
      argument: 'ENV',
      deprecated: false,
      description:
        'Environments to enable. Repeatable and comma-separated (e.g. -e production -e preview, or -e production,preview). Defaults to all environments.',
    },
    {
      name: 'project',
      shorthand: 'p',
      type: String,
      argument: 'NAME_OR_ID',
      deprecated: false,
      description: 'Project name or ID (default: current linked project)',
    },
    {
      ...yesOption,
      description: 'Skip the confirmation prompt',
    },
    formatOption,
  ],
  examples: [
    {
      name: 'Attach the current project to a connector for all environments',
      value: `${packageName} connex attach scl_abc123`,
    },
    {
      name: 'Restrict to specific environments',
      value: `${packageName} connex attach scl_abc123 -e production -e preview`,
    },
    {
      name: 'Attach a different project by name',
      value: `${packageName} connex attach slack/my-bot --project my-app`,
    },
    {
      name: 'Non-interactive output as JSON',
      value: `${packageName} connex attach scl_abc123 --yes --format=json`,
    },
  ],
} as const;

export const connexCommand = {
  name: 'connex',
  aliases: [],
  description: 'Manage Vercel Connect connectors',
  arguments: [],
  options: [],
  subcommands: [
    createSubcommand,
    listSubcommand,
    tokenSubcommand,
    attachSubcommand,
    removeSubcommand,
    openSubcommand,
  ],
  examples: [
    {
      name: 'Create a Slack app',
      value: `${packageName} connex create slack`,
    },
    {
      name: 'List Connex connectors on the current team',
      value: `${packageName} connex list`,
    },
    {
      name: 'Get a token',
      value: `${packageName} connex token scl_abc123`,
    },
    {
      name: 'Attach the current project to a connector',
      value: `${packageName} connex attach scl_abc123`,
    },
    {
      name: 'Open a connector in the dashboard',
      value: `${packageName} connex open scl_abc123`,
    },
  ],
} as const;
