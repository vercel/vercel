import {
  nextCursorOption,
  sinceOption,
  untilOption,
} from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

const projectOption = {
  name: 'project',
  shorthand: 'p',
  type: String,
  argument: 'NAME|ID',
  deprecated: false,
  description: 'Project name or id to query (overrides the linked project)',
} as const;

const environmentOption = {
  name: 'environment',
  shorthand: 'e',
  type: String,
  argument: 'ENVIRONMENT',
  deprecated: false,
  description:
    'Environment to query Agent Runs from: production or preview (default: production)',
} as const;

const agentRunsUntilOption = {
  ...untilOption,
  description:
    'End time: ISO 8601 or relative; requires --since (default: now)',
} as const;

const jsonOption = {
  name: 'json',
  shorthand: null,
  type: Boolean,
  deprecated: false,
  description: 'Print the raw API response as JSON to stdout',
} as const;

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List Agent Runs for a project',
  arguments: [],
  options: [
    projectOption,
    environmentOption,
    sinceOption,
    agentRunsUntilOption,
    {
      name: 'query',
      shorthand: 'q',
      type: String,
      argument: 'TEXT',
      deprecated: false,
      description: 'Search Agent Runs by title',
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
    nextCursorOption,
    {
      name: 'page',
      shorthand: null,
      type: Number,
      argument: 'N',
      deprecated: true,
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
      value: `${packageName} agent-runs list`,
    },
    {
      name: 'List preview Agent Runs from the last day',
      value: `${packageName} agent-runs list --environment preview --since 1d`,
    },
    {
      name: 'Search Agent Runs by title',
      value: `${packageName} agent-runs list --query "checkout"`,
    },
    {
      name: 'List Agent Runs for a specific team and project',
      value: `${packageName} agent-runs list --scope my-team --project my-app`,
    },
    {
      name: 'Print the raw list as JSON',
      value: `${packageName} agent-runs list --json`,
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
    agentRunsUntilOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Inspect an Agent Run',
      value: `${packageName} agent-runs inspect run_1234567890`,
    },
    {
      name: 'Print the raw Agent Run as JSON',
      value: `${packageName} agent-runs inspect run_1234567890 --json`,
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
    agentRunsUntilOption,
    {
      name: 'next',
      shorthand: null,
      type: String,
      argument: 'CURSOR',
      deprecated: false,
      description:
        'Fetch newer trace activity using a cursor from a previous response',
    },
    {
      name: 'previous',
      shorthand: null,
      type: String,
      argument: 'CURSOR',
      deprecated: false,
      description:
        'Fetch older trace activity using a cursor from a previous response',
    },
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
      value: `${packageName} agent-runs trace run_1234567890`,
    },
    {
      name: 'Print the raw trace as JSON without truncation',
      value: `${packageName} agent-runs trace run_1234567890 --json --max-field-length 0`,
    },
    {
      name: 'Fetch newer activity from a paginated trace response',
      placeholders: ['<CURSOR>'],
      value: `${packageName} agent-runs trace run_1234567890 --next <CURSOR>`,
    },
  ],
} as const;

export const projectsSubcommand = {
  name: 'projects',
  aliases: [],
  description: 'List projects in the current team with Agent Runs activity',
  arguments: [],
  options: [environmentOption, sinceOption, agentRunsUntilOption, jsonOption],
  examples: [
    {
      name: 'List projects with Agent Runs activity',
      value: `${packageName} agent-runs projects`,
    },
    {
      name: 'List projects with Agent Runs activity in another team',
      value: `${packageName} agent-runs projects --scope my-team`,
    },
  ],
} as const;

export const agentRunsCommand = {
  name: 'agent-runs',
  aliases: [],
  description: 'Inspect Agent Runs observability data',
  arguments: [],
  subcommands: [
    listSubcommand,
    inspectSubcommand,
    traceSubcommand,
    projectsSubcommand,
  ],
  options: [],
  examples: [
    {
      name: 'List recent production Agent Runs for the linked project',
      value: `${packageName} agent-runs list`,
    },
    {
      name: 'List projects with Agent Runs activity',
      value: `${packageName} agent-runs projects`,
    },
    {
      name: 'Inspect an Agent Run',
      value: `${packageName} agent-runs inspect run_1234567890`,
    },
    {
      name: 'Show the trace for an Agent Run',
      value: `${packageName} agent-runs trace run_1234567890`,
    },
  ],
} as const;
