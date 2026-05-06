import { formatOption, yesOption } from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

export const createSubcommand = {
  name: 'create',
  aliases: [],
  description: 'Create a new Connex client',
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
      description: 'Name of the Connex client',
    },
    {
      name: 'triggers',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Enable webhook triggers for this client',
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
  description: 'List Connex clients for the current team',
  arguments: [],
  options: [
    {
      name: 'limit',
      shorthand: null,
      type: Number,
      argument: 'COUNT',
      deprecated: false,
      description: 'Number of clients to return per page',
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
      name: 'List Connex clients for the current team',
      value: `${packageName} connex list`,
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
  description: 'Delete a Connex client',
  arguments: [
    {
      name: 'client',
      required: true,
    },
  ],
  options: [
    {
      name: 'disconnect-all',
      description: 'Disconnects all projects from the client before deletion',
      shorthand: 'a',
      type: Boolean,
      deprecated: false,
    },
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when deleting a client',
    },
    formatOption,
  ],
  examples: [
    {
      name: 'Delete a Connex client by ID',
      value: `${packageName} connex remove scl_abc123`,
    },
    {
      name: 'Delete a Connex client by UID',
      value: `${packageName} connex remove slack/my-bot`,
    },
    {
      name: 'Disconnect all projects from a client, then delete it',
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
    'Get a token for a Connex client (accepts a client ID like scl_abc or a UID like slack/my-bot)',
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
        'Subject type: "user" (default, acts on behalf of you) or "app" (uses the client\'s default installation)',
    },
    {
      name: 'installation-id',
      shorthand: null,
      type: String,
      argument: 'ID',
      deprecated: false,
      description:
        "Target a specific installation (only useful with --subject app; defaults to the client's default installation)",
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
      name: 'Get a user token by client ID',
      value: `${packageName} connex token scl_abc123`,
    },
    {
      name: 'Get a token by client UID',
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
  description: 'Open a Connex client in the Vercel dashboard',
  arguments: [
    {
      name: 'id',
      required: true,
    },
  ],
  options: [formatOption],
  examples: [
    {
      name: 'Open a client by ID',
      value: `${packageName} connex open scl_abc123`,
    },
    {
      name: 'Open a client by UID',
      value: `${packageName} connex open slack/my-bot`,
    },
    {
      name: 'Print the dashboard URL as JSON',
      value: `${packageName} connex open scl_abc123 --format=json`,
    },
  ],
} as const;

export const connexCommand = {
  name: 'connex',
  aliases: [],
  description: 'Manage Vercel Connect clients',
  arguments: [],
  options: [],
  subcommands: [
    createSubcommand,
    listSubcommand,
    tokenSubcommand,
    removeSubcommand,
    openSubcommand,
  ],
  examples: [
    {
      name: 'Create a Slack app',
      value: `${packageName} connex create slack`,
    },
    {
      name: 'List Connex clients on the current team',
      value: `${packageName} connex list`,
    },
    {
      name: 'Get a token',
      value: `${packageName} connex token scl_abc123`,
    },
    {
      name: 'Open a client in the dashboard',
      value: `${packageName} connex open scl_abc123`,
    },
  ],
} as const;
