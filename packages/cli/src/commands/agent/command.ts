import { packageName } from '../../util/pkg-name';
import { yesOption } from '../../util/arg-common';

const projectOption = {
  name: 'project',
  shorthand: null,
  type: String,
  argument: 'NAME|ID',
  deprecated: false,
  description: 'Project name or id to query (overrides the linked project)',
} as const;

const environmentOption = {
  name: 'environment',
  shorthand: null,
  type: String,
  argument: 'production|preview',
  deprecated: false,
  description: 'Environment to query Agent Runs from (default: production)',
} as const;

const sinceOption = {
  name: 'since',
  shorthand: null,
  type: String,
  argument: 'TIME',
  deprecated: false,
  description:
    'Only include Agent Runs after this time (ISO 8601 or relative: 1h, 30m, 7d)',
} as const;

const untilOption = {
  name: 'until',
  shorthand: null,
  type: String,
  argument: 'TIME',
  deprecated: false,
  description:
    'Only include Agent Runs before this time (requires --since; default: now)',
} as const;

const jsonOption = {
  name: 'json',
  shorthand: null,
  type: Boolean,
  deprecated: false,
  description: 'Print the raw API response as JSON to stdout',
} as const;

export const initSubcommand = {
  name: 'init',
  aliases: [],
  default: true,
  description:
    'Generate an AGENTS.md file with Vercel deployment best practices',
  arguments: [],
  options: [
    {
      ...yesOption,
      description: 'Skip confirmation prompt',
    },
  ],
  examples: [
    {
      name: 'Generate AGENTS.md with Vercel best practices',
      value: `${packageName} agent init`,
    },
    {
      name: 'Skip confirmation prompt (useful for CI)',
      value: `${packageName} agent init --yes`,
    },
  ],
} as const;

export const runsSubcommand = {
  name: 'runs',
  aliases: [],
  description: 'List Agent Runs for a project',
  arguments: [],
  options: [
    projectOption,
    environmentOption,
    sinceOption,
    untilOption,
    {
      name: 'search',
      shorthand: null,
      type: String,
      argument: 'TEXT',
      deprecated: false,
      description: 'Search Agent Runs by title',
    },
    {
      name: 'page',
      shorthand: null,
      type: Number,
      argument: 'N',
      deprecated: false,
      description: '1-based page number (default: 1)',
    },
    {
      name: 'limit',
      shorthand: 'n',
      type: Number,
      argument: 'N',
      deprecated: false,
      description: 'Number of Agent Runs per page (max: 100)',
    },
    jsonOption,
  ],
  examples: [
    {
      name: 'List recent production Agent Runs for the linked project',
      value: `${packageName} agent runs`,
    },
    {
      name: 'List preview Agent Runs from the last day',
      value: `${packageName} agent runs --environment preview --since 1d`,
    },
    {
      name: 'Search Agent Runs by title',
      value: `${packageName} agent runs --search "checkout"`,
    },
    {
      name: 'List Agent Runs for a specific team and project',
      value: `${packageName} agent runs --scope my-team --project my-app`,
    },
    {
      name: 'Print the raw list as JSON',
      value: `${packageName} agent runs --json`,
    },
  ],
} as const;

export const inspectSubcommand = {
  name: 'inspect',
  aliases: [],
  description:
    'Show metadata, lifecycle events, usage, and subagent data for an Agent Run',
  arguments: [
    {
      name: 'runId',
      required: true,
    },
  ],
  options: [
    projectOption,
    environmentOption,
    sinceOption,
    untilOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Inspect an Agent Run',
      value: `${packageName} agent inspect run_1234567890`,
    },
    {
      name: 'Print the raw Agent Run as JSON',
      value: `${packageName} agent inspect run_1234567890 --json`,
    },
  ],
} as const;

export const traceSubcommand = {
  name: 'trace',
  aliases: [],
  description:
    'Show the trace for an Agent Run (turns, messages, reasoning, and tool calls)',
  arguments: [
    {
      name: 'runId',
      required: true,
    },
  ],
  options: [
    projectOption,
    environmentOption,
    sinceOption,
    untilOption,
    {
      name: 'max-field-length',
      shorthand: null,
      type: Number,
      argument: 'N',
      deprecated: false,
      description:
        'Maximum length for individual string fields in the trace (default: 8000; 0 disables truncation)',
    },
    jsonOption,
  ],
  examples: [
    {
      name: 'Show the trace for an Agent Run',
      value: `${packageName} agent trace run_1234567890`,
    },
    {
      name: 'Print the raw trace as JSON without truncation',
      value: `${packageName} agent trace run_1234567890 --json --max-field-length 0`,
    },
  ],
} as const;

export const projectsSubcommand = {
  name: 'projects',
  aliases: [],
  description: 'List projects in the current team with Agent Runs activity',
  arguments: [],
  options: [environmentOption, sinceOption, untilOption, jsonOption],
  examples: [
    {
      name: 'List projects with Agent Runs activity',
      value: `${packageName} agent projects`,
    },
    {
      name: 'List projects with Agent Runs activity in another team',
      value: `${packageName} agent projects --scope my-team`,
    },
  ],
} as const;

export const agentCommand = {
  name: 'agent',
  aliases: [],
  description:
    'Generate agent guidance and inspect Agent Runs observability data',
  arguments: [],
  subcommands: [
    initSubcommand,
    runsSubcommand,
    inspectSubcommand,
    traceSubcommand,
    projectsSubcommand,
  ],
  options: [],
  examples: [
    {
      name: 'Generate AGENTS.md with Vercel best practices',
      value: `${packageName} agent init`,
    },
    {
      name: 'List recent production Agent Runs for the linked project',
      value: `${packageName} agent runs`,
    },
    {
      name: 'Inspect an Agent Run',
      value: `${packageName} agent inspect run_1234567890`,
    },
    {
      name: 'Show the trace for an Agent Run',
      value: `${packageName} agent trace run_1234567890`,
    },
  ],
} as const;
