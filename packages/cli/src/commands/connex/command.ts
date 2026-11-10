import {
  formatOption,
  gitBranchOption,
  jsonOption,
  projectOption,
  yesOption,
} from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

// Hidden: `--trigger-branch` is the old name of `--git-branch`.
const triggerBranchOption = {
  name: 'trigger-branch',
  shorthand: null,
  type: String,
  argument: 'BRANCH',
  deprecated: true,
  description: 'Deprecated alias for `--git-branch`',
} as const;

export const createSubcommand = {
  name: 'create',
  aliases: [],
  dynamicHelp: true,
  description:
    'Create a new connector\n\nAccepts a known service (slack, notion, okta) or the URL of an OAuth or MCP server (mcp.notion.com/mcp). Run `create <service> --help` to see how a specific service can be connected to.',
  arguments: [
    {
      name: 'service',
      required: true,
    },
  ],
  options: [
    {
      name: 'name',
      shorthand: null,
      deprecatedShorthand: 'n',
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
      name: 'trigger-event',
      shorthand: null,
      type: [String],
      argument: 'EVENT',
      deprecated: false,
      description:
        "Webhook event to receive. Repeatable. Requires --triggers and replaces the provider's default events.",
    },
    {
      name: 'trigger-project',
      shorthand: null,
      type: String,
      argument: 'PROJECT',
      deprecated: false,
      description:
        'Target a project by name or ID instead of the linked project. Requires --triggers.',
    },
    {
      name: 'trigger-path',
      shorthand: null,
      type: String,
      argument: 'PATH',
      deprecated: false,
      description:
        'Set the path on the destination project that receives forwarded webhooks. Requires --triggers.',
    },
    {
      ...gitBranchOption,
      description:
        'Target a preview deployment by Git branch name. Omit the option to target production. Cannot be combined with --trigger-environment. Requires --triggers.',
    },
    triggerBranchOption,
    {
      name: 'trigger-environment',
      shorthand: null,
      type: String,
      argument: 'ENVIRONMENT',
      deprecated: false,
      description:
        'Target a custom environment by slug or stable ID. Cannot be combined with --git-branch. Requires --triggers.',
    },
    {
      name: 'connection-method',
      shorthand: null,
      type: String,
      argument: 'METHOD',
      deprecated: false,
      description:
        'How to connect to the service (e.g. oauth, mcp, api-key). Run without it to choose interactively; the error lists the valid values for a service.',
    },
    {
      name: 'target',
      shorthand: null,
      type: String,
      argument: 'TARGET',
      deprecated: false,
      description:
        "Which of the service's products to connect to (e.g. api, mcp). Only needed when a service exposes more than one.",
    },
    {
      name: 'param',
      shorthand: null,
      type: [String],
      argument: 'KEY=VALUE',
      deprecated: false,
      description:
        'Value for a connection method template field (e.g. domain=acme.okta.com). Repeatable.',
    },
    {
      ...yesOption,
      description: 'Skip the single-connection-method confirmation prompt',
    },
    {
      name: 'data',
      shorthand: null,
      type: String,
      argument: 'JSON',
      deprecated: false,
      description:
        'JSON object for non-managed connector creation. When set, posts directly to the connector create API. Pass `@<path>` to read from a file or `@-` to read from stdin — recommended for secrets (e.g. client secrets), which leak into shell history when passed inline.',
    },
    {
      name: 'connector-type',
      shorthand: null,
      type: String,
      argument: 'TYPE',
      deprecated: false,
      description:
        'Connector type for non-managed creation (default: resolved from the service).',
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
    jsonOption,
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
      name: 'Create with selected webhook events',
      value: `${packageName} connect create linear --name linear --triggers --trigger-event Issue --trigger-event Comment --trigger-event Project`,
    },
    {
      name: 'Create with a custom trigger path',
      value: `${packageName} connect create github --name github --triggers --trigger-path /eve/v1/github`,
    },
    {
      name: 'Create with branch-specific trigger routing',
      value: `${packageName} connect create github --name github --triggers --trigger-path /api/webhooks --git-branch staging`,
    },
    {
      name: 'Create with trigger routing on another project',
      value: `${packageName} connect create github --name github --triggers --trigger-project my-api --trigger-path /api/webhooks`,
    },
    {
      name: 'Create with branding (icon and colors)',
      value: `${packageName} connect create slack --name my-bot --icon ./logo.png --background-color '#1A2B3C' --accent-color '#FF0066'`,
    },
    {
      name: 'Create with a specific connection method',
      value: `${packageName} connect create notion --connection-method mcp --name notion-mcp`,
    },
    {
      name: 'Create with an API key, reading it from a file',
      value: `${packageName} connect create notion --connection-method api-key --name notion --data @key.json`,
    },
    {
      name: 'Create from a connection method that needs template values',
      value: `${packageName} connect create okta --connection-method custom-server --param domain=acme.okta.com --param auth_server_id=default --name okta --data @creds.json`,
    },
    {
      name: 'Target a specific product of a service',
      value: `${packageName} connect create notion --target api --connection-method oauth --name notion --data @creds.json`,
    },
    {
      name: 'Create a non-managed connector from explicit data',
      value: `${packageName} connect create mcp.linear.app --name linear --data '{"clientId":"abc123"}'`,
    },
    {
      name: 'Create a non-managed connector, reading credentials from a file (keeps secrets out of shell history)',
      value: `${packageName} connect create slack --name my-bot --connector-type slack --data @slack-app.json`,
    },
    {
      name: 'Create a non-managed connector, reading credentials from stdin',
      value: `cat slack-app.json | ${packageName} connect create slack --name my-bot --connector-type slack --data @-`,
    },
    {
      name: 'Output as JSON',
      value: `${packageName} connect create slack --json`,
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
    jsonOption,
  ],
  examples: [
    {
      name: 'Update the connector icon',
      value: `${packageName} connect update scl_abc123 --icon ./logo.png`,
    },
    {
      name: 'Update the connector colors',
      value: `${packageName} connect update scl_abc123 --background-color '#1A2B3C' --accent-color '#FF0066'`,
    },
    {
      name: 'Output as JSON',
      value: `${packageName} connect update scl_abc123 --icon ./logo.png --json`,
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
      shorthand: 'n',
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
      description:
        'Show the next page using the cursor from the previous output',
    },
    {
      name: 'query',
      shorthand: 'q',
      type: String,
      argument: 'TEXT',
      deprecated: false,
      description: 'Search connectors by name or UID',
    },
    // Hidden: `--search` is the old name of `--query`.
    {
      name: 'search',
      shorthand: null,
      type: String,
      argument: 'TEXT',
      deprecated: true,
      description: 'Deprecated alias for `--query`',
    },
    {
      name: 'service',
      shorthand: null,
      type: [String],
      argument: 'NAME',
      deprecated: false,
      description:
        'Filter by service name (e.g. slack, mcp.linear.app). Repeatable.',
    },
    {
      name: 'type',
      shorthand: null,
      type: [String],
      argument: 'TYPE',
      deprecated: false,
      description:
        'Filter by connector type (slack, github, oauth, custom). Repeatable.',
    },
    formatOption,
    jsonOption,
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
      name: 'Filter by connector type',
      value: `${packageName} connect list --type slack`,
    },
    {
      name: 'Filter by multiple types',
      value: `${packageName} connect list --type oauth --type github`,
    },
    {
      name: 'Filter by service name',
      value: `${packageName} connect list --service mcp.linear.app`,
    },
    {
      name: 'Search by text',
      value: `${packageName} connect list --query linear`,
    },
    {
      name: 'Combine filters',
      value: `${packageName} connect list --type oauth --query prod`,
    },
    {
      name: 'Limit the number of results',
      value: `${packageName} connect list --limit 10`,
    },
    {
      name: 'Show the next page, using the cursor from the previous output',
      placeholders: ['<CURSOR>'],
      value: `${packageName} connect list --next <CURSOR>`,
    },
    {
      name: 'Output as JSON',
      value: `${packageName} connect list --json`,
    },
  ],
} as const;

export const removeSubcommand = {
  name: 'delete',
  aliases: ['rm', 'del', 'remove'],
  description: 'Delete a connector',
  arguments: [
    {
      name: 'connector',
      required: true,
    },
  ],
  options: [
    {
      name: 'disconnect-all',
      description:
        'Disconnects all projects from the connector before deletion',
      shorthand: null,
      deprecatedShorthand: 'a',
      type: Boolean,
      deprecated: false,
    },
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when deleting a connector',
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Delete a connector by ID',
      value: `${packageName} connect delete scl_abc123`,
    },
    {
      name: 'Delete a connector by UID',
      value: `${packageName} connect delete slack/my-bot`,
    },
    {
      name: 'Disconnect all projects from a connector, then delete it',
      value: [
        `${packageName} connect delete scl_abc123 --disconnect-all`,
        `${packageName} connect delete slack/my-bot --disconnect-all`,
      ],
    },
    {
      name: 'Skip the confirmation prompt',
      value: `${packageName} connect delete scl_abc123 --yes`,
    },
    {
      name: 'Output as JSON',
      value: `${packageName} connect delete scl_abc123 --json --yes`,
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
      shorthand: null,
      deprecatedShorthand: 's',
      type: String,
      argument: 'TYPE',
      deprecated: false,
      description:
        'Subject type: "user" (acts on behalf of you) or "app" (uses the connector\'s default installation) (default: "user")',
    },
    {
      name: 'installation',
      shorthand: null,
      type: String,
      argument: 'INSTALLATION',
      deprecated: false,
      description:
        "Target a specific installation (only useful with --subject app) (default: the connector's default installation)",
    },
    // Hidden: `--installation-id` is the old name of `--installation`.
    {
      name: 'installation-id',
      shorthand: null,
      type: String,
      argument: 'ID',
      deprecated: true,
      description: 'Deprecated alias for `--installation`',
    },
    {
      name: 'scopes',
      shorthand: null,
      type: String,
      argument: 'SCOPES',
      deprecated: false,
      description:
        'Scopes (comma- or space-separated) (default: connector defaults)',
    },
    {
      name: 'no-default-scopes',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Do not request the connector default scopes',
    },
    yesOption,
    formatOption,
    jsonOption,
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
      value: `${packageName} connect token scl_abc123 --subject app --installation inst_1`,
    },
    {
      name: 'Open the browser automatically if authorization/installation is required',
      value: `${packageName} connect token scl_abc123 --yes`,
    },
    {
      name: 'Output as JSON (includes expiresAt, installationId, etc.)',
      value: `${packageName} connect token scl_abc123 --json`,
    },
  ],
} as const;

export const revokeTokensSubcommand = {
  name: 'revoke-tokens',
  aliases: [],
  description: 'Revoke tokens issued from a connector',
  arguments: [
    {
      name: 'connector',
      required: true,
    },
  ],
  options: [
    {
      name: 'my-tokens',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Revoke only your own tokens for this connector',
    },
    {
      name: 'all-tokens',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Revoke every token for all users and installations. Requires team owner or member permissions.',
    },
    {
      ...yesOption,
      description: 'Skip the confirmation prompt',
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Interactively select which tokens to revoke',
      value: `${packageName} connect revoke-tokens scl_abc123`,
    },
    {
      name: 'Revoke only your own tokens',
      value: `${packageName} connect revoke-tokens scl_abc123 --my-tokens`,
    },
    {
      name: 'Revoke all tokens for all users',
      value: `${packageName} connect revoke-tokens scl_abc123 --all-tokens`,
    },
    {
      name: 'Skip the confirmation prompt',
      value: `${packageName} connect revoke-tokens scl_abc123 --my-tokens --yes`,
    },
    {
      name: 'Output as JSON',
      value: `${packageName} connect revoke-tokens scl_abc123 --my-tokens --yes --json`,
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
  options: [formatOption, jsonOption],
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
      value: `${packageName} connect open scl_abc123 --json`,
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
      name: 'connector',
      required: true,
    },
  ],
  options: [
    {
      name: 'environment',
      shorthand: 'e',
      type: [String],
      argument: 'ENVIRONMENT',
      deprecated: false,
      description:
        'Environments to enable by system name, custom slug, or custom ID. Repeatable and comma-separated (default: production, preview, and development).',
    },
    {
      ...projectOption,
      shorthand: 'p',
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
      ...gitBranchOption,
      description:
        'Target a preview deployment by Git branch name. Omit the option to target production. Cannot be combined with --trigger-environment. Only valid with --triggers.',
    },
    triggerBranchOption,
    {
      name: 'trigger-environment',
      shorthand: null,
      type: String,
      argument: 'ENVIRONMENT',
      deprecated: false,
      description:
        'Target a custom environment by slug or stable ID. Cannot be combined with --git-branch. Only valid with --triggers.',
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
    jsonOption,
  ],
  examples: [
    {
      name: 'Attach the current project for all system environments',
      value: `${packageName} connect attach scl_abc123`,
    },
    {
      name: 'Restrict to specific environments',
      value: `${packageName} connect attach scl_abc123 -e production -e preview`,
    },
    {
      name: 'Attach to a custom environment by slug',
      value: `${packageName} connect attach scl_abc123 -e qa`,
    },
    {
      name: 'Attach to a custom environment by stable ID',
      value: `${packageName} connect attach scl_abc123 -e env_qa123`,
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
      value: `${packageName} connect attach scl_abc123 --triggers --git-branch staging --trigger-path /slack`,
    },
    {
      name: 'Attach and register a custom-environment trigger destination',
      value: `${packageName} connect attach scl_abc123 --triggers --trigger-environment qa --trigger-path /slack`,
    },
    {
      name: 'Non-interactive output as JSON',
      value: `${packageName} connect attach scl_abc123 --yes --json`,
    },
  ],
} as const;

export const detachSubcommand = {
  name: 'detach',
  aliases: [],
  description: 'Detach a Vercel project from a connector',
  arguments: [
    {
      name: 'connector',
      required: true,
    },
  ],
  options: [
    {
      ...projectOption,
      shorthand: 'p',
      description: 'Project name or ID (default: current linked project)',
    },
    {
      ...yesOption,
      description: 'Skip the confirmation prompt',
    },
    formatOption,
    jsonOption,
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
      value: `${packageName} connect detach scl_abc123 --yes --json`,
    },
  ],
} as const;

export const contactsAddSubcommand = {
  name: 'add',
  aliases: [],
  description: 'Add a phone contact that a connector may message',
  arguments: [
    {
      name: 'connector',
      required: true,
    },
  ],
  options: [
    {
      name: 'phone-number',
      shorthand: null,
      type: String,
      argument: 'PHONE',
      deprecated: false,
      description: 'Contact phone number in E.164 format (e.g. +12025551234)',
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Add a contact by connector ID',
      value: `${packageName} connect contacts add scl_abc123 --phone-number +12025551234`,
    },
    {
      name: 'Add a contact by connector UID',
      value: `${packageName} connect contacts add linq/support --phone-number +12025551234`,
    },
    {
      name: 'Output the verification result as JSON',
      value: `${packageName} connect contacts add scl_abc123 --phone-number +12025551234 --json`,
    },
  ],
} as const;

export const contactsSubcommand = {
  name: 'contacts',
  aliases: [],
  description: 'Manage phone contacts for connectors',
  arguments: [],
  options: [],
  subcommands: [contactsAddSubcommand],
  examples: [
    {
      name: 'Add a contact',
      value: `${packageName} connect contacts add scl_abc123 --phone-number +12025551234`,
    },
  ],
} as const;

export const discoverSubcommand = {
  name: 'discover',
  aliases: [],
  description:
    'Discover services you can create a connector for\n\nMatches the query against service names, aliases, keywords, and descriptions.',
  arguments: [
    {
      name: 'query',
      required: false,
    },
  ],
  options: [
    {
      name: 'category',
      shorthand: null,
      type: [String],
      argument: 'SLUG',
      deprecated: false,
      description: `Filter by category. Repeatable. Run \`${packageName} connect categories\` for valid slugs.`,
    },
    {
      name: 'connection-method',
      shorthand: null,
      type: [String],
      argument: 'METHOD',
      deprecated: false,
      description:
        'Filter by connection method (oauth, api-key, mcp, or a service-specific method). Repeatable.',
    },
    {
      name: 'target',
      shorthand: null,
      type: [String],
      argument: 'TARGET',
      deprecated: false,
      description:
        'Filter by the product a service exposes (e.g. mcp). Repeatable.',
    },
    {
      name: 'supports-triggers',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Only show services that can forward webhook triggers',
    },
    {
      name: 'limit',
      shorthand: 'n',
      type: Number,
      argument: 'COUNT',
      deprecated: false,
      description: 'Number of services to return (default: 50, max: 500)',
    },
    {
      name: 'next',
      shorthand: null,
      type: String,
      argument: 'CURSOR',
      deprecated: false,
      description:
        'Show the next page using the cursor from the previous output',
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Discover services',
      value: `${packageName} connect discover`,
    },
    {
      name: 'Search for a service',
      value: `${packageName} connect discover crm`,
    },
    {
      name: 'Filter by category',
      value: `${packageName} connect discover --category ai --category data`,
    },
    {
      name: 'Find services with an MCP server',
      value: `${packageName} connect discover --connection-method mcp`,
    },
    {
      name: 'Find services that support webhook triggers',
      value: `${packageName} connect discover --supports-triggers`,
    },
    {
      name: 'Show the next page, using the cursor from the previous output',
      placeholders: ['<CURSOR>'],
      value: `${packageName} connect discover --next <CURSOR>`,
    },
    {
      name: 'Output as JSON',
      value: `${packageName} connect discover --json`,
    },
  ],
} as const;

export const categoriesSubcommand = {
  name: 'categories',
  aliases: [],
  description: 'List the categories services are grouped into',
  arguments: [],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'List categories',
      value: `${packageName} connect categories`,
    },
    {
      name: 'Output as JSON',
      value: `${packageName} connect categories --json`,
    },
  ],
} as const;

export const connexCommand = {
  name: 'connect',
  aliases: [],
  description: 'Manage connectors',
  arguments: [],
  options: [],
  subcommands: [
    discoverSubcommand,
    categoriesSubcommand,
    createSubcommand,
    updateSubcommand,
    listSubcommand,
    tokenSubcommand,
    attachSubcommand,
    detachSubcommand,
    removeSubcommand,
    revokeTokensSubcommand,
    openSubcommand,
    contactsSubcommand,
  ],
  examples: [
    {
      name: 'Discover services to connect to',
      value: `${packageName} connect discover`,
    },
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
  documentation: {
    label: 'Vercel Connect guide',
    url: 'https://vercel.com/kb/guide/vercel-connect',
  },
} as const;
