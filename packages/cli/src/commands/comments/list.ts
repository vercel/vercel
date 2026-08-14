import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import getScope from '../../util/get-scope';
import { stripSensitiveAuthArgs } from '../../util/redact-args';
import { getCommandName } from '../../util/pkg-name';
import { isAPIError } from '../../util/errors-ts';
import { validateJsonOutput } from '../../util/output-format';
import {
  outputError,
  handleValidationError,
  validateIntegerRangeWithDefault,
} from '../../util/command-validation';
import type { CommentsTelemetryClient } from '../../util/telemetry/commands/comments';
import { listSubcommand } from './command';
import { handleCommentsParseError } from './errors';
import { listThreads } from './api';
import { resolveCommentsScope, inferBranch } from './scope';
import { renderThreadRow } from './format';
import type {
  BranchFocus,
  CommentsScope,
  ListThreadsParams,
  Thread,
} from './types';

export interface ListFlags {
  '--project'?: string;
  '--branch'?: string[];
  '--all-branches'?: boolean;
  '--status'?: string;
  '--page'?: string[];
  '--author'?: string[];
  '--content-id'?: string[];
  '--search'?: string;
  '--limit'?: number;
  '--next'?: string;
  '--format'?: string;
}

type StatusFilter = 'unresolved' | 'resolved' | 'all';

function validateStatus(value: string | undefined) {
  const status = (value ?? 'unresolved') as StatusFilter;
  if (!['unresolved', 'resolved', 'all'].includes(status)) {
    return undefined;
  }
  return status;
}

async function resolveAuthors(
  client: Client,
  authors: string[] | undefined
): Promise<string[] | undefined> {
  if (!authors || authors.length === 0) {
    return undefined;
  }
  if (!authors.includes('me')) {
    return authors;
  }
  const { user } = await getScope(client);
  return authors.map(author => (author === 'me' ? user.id : author));
}

function statusWord(status: StatusFilter): string {
  return status === 'all' ? '' : ` ${status}`;
}

/**
 * Name the active narrowing filters when a listing comes back empty, so a
 * filtered-to-nothing inbox never looks like a genuinely empty one. The
 * author hint matters most: the API silently matches nothing for usernames
 * (verified — it takes user IDs only), so this line is the only signal.
 */
function printActiveFilters(flags: ListFlags): void {
  const parts: string[] = [];
  if (flags['--author']?.length) {
    parts.push(
      `--author ${flags['--author'].join(', ')} (takes a user ID or \`me\` — usernames match nothing)`
    );
  }
  if (flags['--page']?.length) {
    parts.push(`--page ${flags['--page'].join(', ')}`);
  }
  if (flags['--search']) {
    parts.push(`--search ${flags['--search']}`);
  }
  if (flags['--content-id']?.length) {
    parts.push(`--content-id ${flags['--content-id'].join(', ')}`);
  }
  if (parts.length > 0) {
    output.log(`Filters: ${parts.join(' · ')}`);
  }
}

function countLine(count: number, status: StatusFilter): string {
  return `${count}${statusWord(status)} comment${count === 1 ? '' : 's'}`;
}

const SCOPE_FLAG_NAMES = new Set([
  '--scope',
  '-S',
  '--project',
  '-p',
  '--team',
  '-T',
]);

/**
 * Suggested-command builders work from the RAW argv, never from parsed
 * flags: parsed flags include globals like --token (which must never appear
 * in output — stripped via the house `stripSensitiveAuthArgs`), and
 * stringify repeatable flags as a comma-join that does not round-trip
 * (`--branch a,b` queries one branch literally named "a,b").
 */
function argvFlagTokens(client: Client): string[] {
  return stripSensitiveAuthArgs(client.argv.slice(3));
}

/**
 * Scope flags (--scope, --project) as a suffix for suggested commands. A
 * hint that drops the scope it was generated under 404s in the default team
 * when followed.
 */
function scopeFlagsSuffix(client: Client): string {
  const tokens = argvFlagTokens(client);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const name = token.split('=')[0];
    if (!SCOPE_FLAG_NAMES.has(name)) {
      continue;
    }
    out.push(token);
    if (!token.includes('=') && i + 1 < tokens.length) {
      out.push(tokens[++i]);
    }
  }
  return out.length > 0 ? ` ${out.join(' ')}` : '';
}

/** All current flags except pagination, for the next-page suggestion. */
function nextPageFlagsSuffix(client: Client): string {
  const tokens = argvFlagTokens(client);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token.startsWith('-')) {
      continue;
    }
    const name = token.split('=')[0];
    if (name === '--next' || name === '-N') {
      if (!token.includes('=') && i + 1 < tokens.length) {
        i++;
      }
      continue;
    }
    out.push(token);
    if (
      !token.includes('=') &&
      i + 1 < tokens.length &&
      !tokens[i + 1].startsWith('-')
    ) {
      out.push(tokens[++i]);
    }
  }
  return out.length > 0 ? ` ${out.join(' ')}` : '';
}

/**
 * Branch names in probe suggestions come from REMOTE thread data; git
 * refnames may contain `$(…)`, `$VAR`, etc. Never interpolate untrusted
 * content into a suggested shell command unquoted.
 */
function shellSafe(value: string): string {
  if (/^[A-Za-z0-9._/-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}

async function printEmptyState(
  client: Client,
  scope: CommentsScope,
  focus: BranchFocus,
  params: ListThreadsParams,
  status: StatusFilter,
  flags: ListFlags
): Promise<void> {
  // One branch-unfiltered probe (every other filter kept) so the empty
  // state names the exact next action instead of hiding comments.
  let probe;
  try {
    probe = await listThreads(client, scope.teamId, {
      ...params,
      branch: undefined,
      cursor: undefined,
      limit: 20,
    });
  } catch {
    output.log(`No${statusWord(status)} comments on ${focus.value}.`);
    return;
  }

  const branches = new Map<string, number>();
  for (const thread of probe.threads) {
    const branch = thread.branch ?? '(no branch)';
    branches.set(branch, (branches.get(branch) ?? 0) + 1);
  }

  if (branches.size === 0) {
    output.log(
      `No${statusWord(status)} comments in ${scope.projectName ?? 'this project'} on any branch.`
    );
    printActiveFilters(flags);
    return;
  }

  output.log(`No${statusWord(status)} comments on ${focus.value}.`);
  const suffix = probe.pagination.nextCursor ? '+' : '';
  const scopeSuffix = scopeFlagsSuffix(client);
  if (branches.size === 1) {
    const [branch, count] = [...branches.entries()][0];
    output.log(
      `${count}${suffix}${statusWord(status)} on ${chalk.bold(branch)} — run ${getCommandName(`comments --branch ${shellSafe(branch)}${scopeSuffix}`)}`
    );
    return;
  }

  const total = [...branches.values()].reduce((a, b) => a + b, 0);
  output.log(
    `${total}${suffix}${statusWord(status)} on other branches — run ${getCommandName(`comments --all-branches${scopeSuffix}`)}`
  );
}

export default async function list(
  client: Client,
  telemetry: CommentsTelemetryClient,
  defaultInvocation: boolean
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(listSubcommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    return handleCommentsParseError(err, 'list');
  }
  const flags = parsedArgs.flags as ListFlags;

  // Strict positional validation: the inherited default-subcommand routing
  // would otherwise make `vercel comments resovle icZ9` silently list.
  const expectedPositionals = defaultInvocation ? 1 : 2;
  if (parsedArgs.args.length > expectedPositionals) {
    output.error(
      `Unknown ${defaultInvocation ? 'subcommand' : 'argument'} "${parsedArgs.args[expectedPositionals]}". Run \`vercel comments --help\` for usage.`
    );
    return 1;
  }

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const jsonOutput = formatResult.jsonOutput;

  telemetry.trackCliOptionProject(flags['--project']);
  telemetry.trackCliOptionBranch(flags['--branch']);
  telemetry.trackCliFlagAllBranches(flags['--all-branches']);
  telemetry.trackCliOptionStatus(flags['--status']);
  telemetry.trackCliOptionPage(flags['--page']);
  telemetry.trackCliOptionAuthor(flags['--author']);
  telemetry.trackCliOptionContentId(flags['--content-id']);
  telemetry.trackCliOptionSearch(flags['--search']);
  telemetry.trackCliOptionLimit(flags['--limit']);
  telemetry.trackCliOptionNext(flags['--next']);
  telemetry.trackCliOptionFormat(flags['--format']);

  const status = validateStatus(flags['--status']);
  if (!status) {
    return outputError(
      client,
      jsonOutput,
      'INVALID_STATUS',
      `Invalid --status "${flags['--status']}". Valid values: unresolved, resolved, all.`
    );
  }

  const limitResult = validateIntegerRangeWithDefault(flags['--limit'], {
    flag: '--limit',
    min: 1,
    max: 100,
    defaultValue: 20,
  });
  if (!limitResult.valid) {
    return handleValidationError(limitResult, jsonOutput, client);
  }

  if (flags['--branch'] && flags['--all-branches']) {
    return outputError(
      client,
      jsonOutput,
      'MUTUAL_EXCLUSIVITY',
      'Cannot specify both --branch and --all-branches.'
    );
  }

  const scope = await resolveCommentsScope(client, {
    project: flags['--project'],
    requireProject: true,
    jsonOutput,
  });
  if (typeof scope === 'number') {
    return scope;
  }

  let focus: BranchFocus | undefined;
  let branchFilter: string[] | undefined;
  if (flags['--branch'] && flags['--branch'].length > 0) {
    branchFilter = flags['--branch'];
    focus = { value: branchFilter.join(', '), source: 'flag' };
  } else if (!flags['--all-branches'] && scope.linked) {
    // Inference only when the project came from the cwd's link: if --project/
    // --scope selected the project, the cwd's git branch belongs to some
    // other repo and would focus on garbage (or worse, coincidental 'main').
    const inferred = inferBranch(client.cwd);
    if (inferred) {
      focus = inferred;
      branchFilter = [inferred.value];
    }
  }

  const authors = await resolveAuthors(client, flags['--author']);

  const params: ListThreadsParams = {
    projectId: scope.projectId,
    branch: branchFilter,
    status: status === 'all' ? undefined : status,
    page: flags['--page'],
    author: authors,
    contentId: flags['--content-id'],
    search: flags['--search'],
    limit: limitResult.value,
    cursor: flags['--next'],
  };

  if (!jsonOutput) {
    output.spinner('Fetching comments…');
  }
  let response;
  try {
    response = await listThreads(client, scope.teamId, params);
  } catch (err) {
    if (isAPIError(err)) {
      return outputError(
        client,
        jsonOutput,
        err.code || 'API_ERROR',
        err.serverMessage || `API error (${err.status}).`
      );
    }
    throw err;
  } finally {
    output.stopSpinner();
  }

  const threads: Thread[] = response.threads ?? [];
  const nextCursor = response.pagination?.nextCursor ?? null;

  if (jsonOutput) {
    const envelope = {
      scope: {
        teamId: scope.teamId,
        ...(scope.teamSlug && { teamSlug: scope.teamSlug }),
        ...(scope.projectId && { projectId: scope.projectId }),
        ...(scope.projectName && { projectName: scope.projectName }),
        ...(focus &&
          focus.source !== 'flag' && { inferredBranch: focus.value }),
      },
      filters: {
        ...(status !== 'all' && { status }),
        ...(focus && { branch: { value: focus.value, source: focus.source } }),
      },
      pagination: { nextCursor },
      threads,
    };
    client.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
    return 0;
  }

  const branchLabel = focus ? focus.value : 'all branches';
  output.log(
    `Comments in ${chalk.bold(scope.projectName ?? scope.projectId ?? '')} · ${branchLabel}`
  );

  if (threads.length === 0) {
    if (focus) {
      await printEmptyState(client, scope, focus, params, status, flags);
    } else {
      output.log(
        `No${statusWord(status)} comments in ${scope.projectName ?? 'this project'}.`
      );
      printActiveFilters(flags);
    }
    return 0;
  }

  output.print('\n');
  for (const thread of threads) {
    output.print(`${renderThreadRow(thread, { showBranch: !focus })}\n\n`);
  }

  output.log(countLine(threads.length, status));
  // Conditional hint per the hint policy: reading a thread is the exact next
  // action of a non-empty inbox. Carry the scope flags this listing ran
  // under — a suggestion that drops them 404s in the default team.
  output.log(
    `To read a thread, run ${getCommandName(`comments inspect <id>${scopeFlagsSuffix(client)}`)}`
  );

  if (nextCursor) {
    output.log(
      `To display the next page, run ${getCommandName(`comments${nextPageFlagsSuffix(client)} --next ${nextCursor}`)}`
    );
  }

  return 0;
}
