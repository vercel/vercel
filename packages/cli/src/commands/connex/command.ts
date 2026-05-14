import { formatOption, yesOption } from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

export const createSubcommand = {
  name: 'create',
  aliases: [],
  description: 'Create a new connector',
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
      description: 'Name of the connector',
    },
    {
      name: 'triggers',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Enable webhook triggers for this connector',
    },
    {
      name: 'icon',
      shorthand: null,
      type: String,
      argument: 'PATH',
      deprecated: false,
      description:
        'Path to a PNG or JPEG image to use as the connector icon (uploaded to Vercel)',
    },
    {
      name: 'background-color',
      shorthand: null,
      type: String,
      argument: 'HEX',
      deprecated: false,
      description: 'Background color for the connector icon (e.g. #1A2B3C)',
    },
    {
      name: 'accent-color',
      shorthand: null,
      type: String,
      argument: 'HEX',
      deprecated: false,
      description: 'Accent color for the connector icon (e.g. #1A2B3C)',
    },
    formatOption,
  ],
  examples: [
    {
      name: 'Create a Slack app',
      value: `${packageName} connect create slack`,
    },
    {
      name: 'Create with a custom name',
      value: `${packageName} connect create slack --name my-bot`,
    },
    {
      name: 'Create with webhook triggers enabled',
      value: `${packageName} connect create slack --name my-bot --triggers`,
    },
    {
      name: 'Create with branding (icon and colors)',
      value: `${packageName} connect create slack --name my-bot --icon ./logo.png --background-color #1A2B3C --accent-color #FF0066`,
    },
    {
      name: 'Output as JSON',
      value: `${packageName} connect create slack --format=json`,
    },
  ],
} as const;

export const updateSubcommand = {
  name: 'update',
  aliases: [],
  description: 'Update connector branding (icon and colors)',
  arguments: [
    {
      name: 'id',
      required: true,
    },
  ],
  options: [
    {
      name: 'icon',
      shorthand: null,
      type: String,
      argument: 'PATH',
      deprecated: false,
      description:
        'Path to a PNG or JPEG image to use as the connector icon (uploaded to Vercel)',
    },
    {
      name: 'background-color',
      shorthand: null,
      type: String,
      argument: 'HEX',
      deprecated: false,
      description: 'Background color for the connector icon (e.g. #1A2B3C)',
    },
    {
      name: 'accent-color',
      shorthand: null,
      type: String,
      argument: 'HEX',
      deprecated: false,
      description: 'Accent color for the connector icon (e.g. #1A2B3C)',
    },
    formatOption,
  ],
  examples: [
    {
      name: 'Update the connector icon',
      value: `${packageName} connect update scl_abc123 --icon ./logo.png`,
    },
    {
      name: 'Update the connector colors',
      value: `${packageName} connect update scl_abc123 --background-color #1A2B3C --accent-color #FF0066`,
    },
    {
      name: 'Output as JSON',
      value: `${packageName} connect update scl_abc123 --icon ./logo.png --format=json`,
    },
  ],
} as const;

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description:
    'List connectors linked to the current project (falls back to every connector in the team when no project is linked or when --all-projects is set)',
  arguments: [],
  options: [
    {
      name: 'all-projects',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'List every connector in the team, regardless of project link',
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
      name: 'List connectors linked to the current project',
      value: `${packageName} connect list`,
    },
    {
      name: 'List every connector in the team',
      value: `${packageName} connect list --all-projects`,
    },
    {
      name: 'Limit the number of results',
      value: `${packageName} connect list --limit 10`,
    },
    {
      name: 'Fetch the next page of results',
      value: `${packageName} connect list --next <cursor>`,
    },
    {
      name: 'Output as JSON',
      value: `${packageName} connect list --format=json`,
    },
  ],
} as const;

export const removeSubcommand = {
  name: 'remove',
  aliases: ['rm'],
  description: 'Delete a connector',
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
      name: 'Delete a connector by ID',
      value: `${packageName} connect remove scl_abc123`,
    },
    {
      name: 'Delete a connector by UID',
      value: `${packageName} connect remove slack/my-bot`,
    },
    {
      name: 'Disconnect all projects from a connector, then delete it',
      value: [
        `${packageName} connect remove scl_abc123 --disconnect-all`,
        `${packageName} connect remove slack/my-bot -a`,
      ],
    },
    {
      name: 'Skip the confirmation prompt',
      value: `${packageName} connect remove scl_abc123 --yes`,
    },
    {
      name: 'Output as JSON',
      value: `${packageName} connect remove scl_abc123 --format=json --yes`,
    },
  ],
} as const;

export const tokenSubcommand = {
  name: 'token',
  aliases: [],
  description:
    'Get a token for a connector (accepts a connector ID like scl_abc or a UID like slack/my-bot)',
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
      value: `${packageName} connect token scl_abc123`,
    },
    {
      name: 'Get a token by connector UID',
      value: `${packageName} connect token slack/my-bot`,
    },
    {
      name: 'Get an app token (default installation)',
      value: `${packageName} connect token scl_abc123 --subject app`,
    },
    {
      name: 'Get an app token for a specific installation',
      value: `${packageName} connect token scl_abc123 --subject app --installation-id inst_1`,
    },
    {
      name: 'Open the browser automatically if authorization/installation is required',
      value: `${packageName} connect token scl_abc123 --yes`,
    },
    {
      name: 'Output as JSON (includes expiresAt, installationId, etc.)',
      value: `${packageName} connect token scl_abc123 --format=json`,
    },
  ],
} as const;

export const openSubcommand = {
  name: 'open',
  aliases: [],
  description: 'Open a connector in the Vercel dashboard',
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
      value: `${packageName} connect open scl_abc123`,
    },
    {
      name: 'Open a connector by UID',
      value: `${packageName} connect open slack/my-bot`,
    },
    {
      name: 'Print the dashboard URL as JSON',
      value: `${packageName} connect open scl_abc123 --format=json`,
    },
  ],
} as const;

export const attachSubcommand = {
  name: 'attach',
  aliases: [],
  description:
    'Attach a Vercel project to a connector for one or more environments',
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
      name: 'triggers',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Also register this project as a trigger destination so the connector forwards verified webhooks to it (max 3 destinations per connector)',
    },
    {
      name: 'trigger-branch',
      shorthand: null,
      type: String,
      argument: 'BRANCH',
      deprecated: false,
      description:
        'Target a specific git branch for the trigger destination (default: production). Only valid with --triggers.',
    },
    {
      name: 'trigger-path',
      shorthand: null,
      type: String,
      argument: 'PATH',
      deprecated: false,
      description:
        'Path on the destination project that receives the forwarded webhook (default: /{service}). Only valid with --triggers.',
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
      value: `${packageName} connect attach scl_abc123`,
    },
    {
      name: 'Restrict to specific environments',
      value: `${packageName} connect attach scl_abc123 -e production -e preview`,
    },
    {
      name: 'Attach a different project by name',
      value: `${packageName} connect attach slack/my-bot --project my-app`,
    },
    {
      name: 'Attach and register the project as a trigger destination',
      value: `${packageName} connect attach scl_abc123 --triggers`,
    },
    {
      name: 'Attach and register a preview-branch trigger destination',
      value: `${packageName} connect attach scl_abc123 --triggers --trigger-branch staging --trigger-path /slack`,
    },
    {
      name: 'Non-interactive output as JSON',
      value: `${packageName} connect attach scl_abc123 --yes --format=json`,
    },
  ],
} as const;

export const detachSubcommand = {
  name: 'detach',
  aliases: [],
  description: 'Detach a Vercel project from a connector',
  arguments: [
    {
      name: 'client',
      required: true,
    },
  ],
  options: [
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
      name: 'Detach the current project from a connector',
      value: `${packageName} connect detach scl_abc123`,
    },
    {
      name: 'Detach a different project by name',
      value: `${packageName} connect detach slack/my-bot --project my-app`,
    },
    {
      name: 'Non-interactive output as JSON',
      value: `${packageName} connect detach scl_abc123 --yes --format=json`,
    },
  ],
} as const;

export const connexCommand = {
  name: 'connect',
  aliases: [],
  description:
    'Manage connectors (Beta).\n\nVercel Connect is currently in beta. Behavior, commands, and output may change before general availability.',
  arguments: [],
  options: [],
  subcommands: [
    createSubcommand,
    updateSubcommand,
    listSubcommand,
    tokenSubcommand,
    attachSubcommand,
    detachSubcommand,
    removeSubcommand,
    openSubcommand,
  ],
  examples: [
    {
      name: 'Create a Slack app',
      value: `${packageName} connect create slack`,
    },
    {
      name: 'List connectors on the current team',
      value: `${packageName} connect list`,
    },
    {
      name: 'Get a token',
      value: `${packageName} connect token scl_abc123`,
    },
    {
      name: 'Attach the current project to a connector',
      value: `${packageName} connect attach scl_abc123`,
    },
    {
      name: 'Open a connector in the dashboard',
      value: `${packageName} connect open scl_abc123`,
    },
  ],
} as const;
