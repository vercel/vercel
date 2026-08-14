import chalk from 'chalk';
import stamp from '../../util/output/stamp';
import eraseLines from '../../util/output/erase-lines';
import chars from '../../util/output/chars';
import invite from './invite';
import { writeToConfigFile } from '../../util/config/files';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import type Client from '../../util/client';
import createTeam from '../../util/teams/create-team';
import patchTeam from '../../util/teams/patch-team';
import { errorToString, isError } from '@vercel/error-utils';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import param from '../../util/output/param';
import { addSubcommand } from './command';
import { isAPIError } from '../../util/errors-ts';
import {
  openUrlInBrowserCommand,
  outputActionRequired,
  outputAgentError,
} from '../../util/agent-output';
import { getSameSubcommandSuggestionFlags } from '../../util/arg-common';

const validateSlug = (value: string) => /^[a-z]+[a-z0-9_-]*$/.test(value);

const validateName = (value: string) => /^[ a-zA-Z0-9_-]+$/.test(value);

const teamUrlPrefix = 'Team URL'.padEnd(14) + chalk.gray('vercel.com/');
const teamNamePrefix = 'Team Name'.padEnd(14);

/** Timeout for create-team API call so we don't spin forever on a hung request */
const CREATE_TEAM_TIMEOUT_MS = 30_000;

const TIMEOUT_HINT =
  'The request took too long and was cancelled. ' +
  'The team URL may already be taken, or the server may be slow. ' +
  'Try a different slug (e.g. your-company-name) or try again later. ' +
  'Run with `--debug` to see where the request is getting stuck.';

function createTeamWithTimeout(
  client: Client,
  slug: string
): Promise<Awaited<ReturnType<typeof createTeam>>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    CREATE_TEAM_TIMEOUT_MS
  );
  output.debug(
    `Creating team with slug "${slug}" (timeout: ${CREATE_TEAM_TIMEOUT_MS / 1000}s, apiUrl: ${client.apiUrl})`
  );
  const promise = createTeam(client, { slug }, { signal: controller.signal })
    .then(result => {
      clearTimeout(timeoutId);
      return result;
    })
    .catch(err => {
      clearTimeout(timeoutId);
      throw err;
    });
  // Fallback: if fetch doesn't honor AbortSignal, still reject after timeout
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('Request timed out.')),
        CREATE_TEAM_TIMEOUT_MS + 500
      )
    ),
  ]);
}

function formatCreateTeamError(err: unknown, slug: string): string {
  const isAbort =
    isError(err) && (err as Error & { name?: string }).name === 'AbortError';
  const isTimeoutMsg = isError(err) && err.message === 'Request timed out.';
  if (isAbort || isTimeoutMsg) {
    return TIMEOUT_HINT;
  }
  if (isAPIError(err) && err.status === 429) {
    const retryMs = (err as { retryAfterMs?: number }).retryAfterMs;
    const retrySec =
      typeof retryMs === 'number' && retryMs >= 0
        ? Math.ceil(retryMs / 1000)
        : 0;
    const formatWait = (sec: number): string => {
      if (sec < 60) return `${sec} seconds`;
      if (sec < 3600) return `${sec} seconds (${Math.ceil(sec / 60)} minutes)`;
      return `${sec} seconds (${(sec / 3600).toFixed(1)} hours)`;
    };
    const waitHint =
      retrySec > 0
        ? ` Try again in ${formatWait(retrySec)}.`
        : ' Wait a minute or two, then try again.';
    return (
      'Rate limited (429 Too Many Requests). ' +
      'The Vercel API limits how often you can create teams.' +
      waitHint +
      ' (The API sends when the rate limit window resets, often a fixed time like the next hour or midnight UTC.) ' +
      'Dashboard: https://vercel.com/account.'
    );
  }
  if (isAPIError(err) && err.status === 400) {
    const msg = (err.serverMessage || err.message || '').toLowerCase();
    const slugHint =
      msg.includes('slug') || msg.includes('cannot be used')
        ? `That team URL (${chalk.cyan(`vercel.com/${slug}`)}) is not available. It may already be taken. `
        : '';
    const paymentHint = msg.includes('payment')
      ? 'A payment method is required to create a team. '
      : '';
    const prefix = slugHint || paymentHint;
    return prefix
      ? `${prefix}${prefix.trim() ? '\n' : ''}${err.serverMessage || err.message}`
      : err.serverMessage || err.message;
  }
  return errorToString(err);
}

/** Plain-text variant for non-interactive JSON (no chalk). */
function formatCreateTeamErrorPlain(err: unknown, slug: string): string {
  const isAbort =
    isError(err) && (err as Error & { name?: string }).name === 'AbortError';
  const isTimeoutMsg = isError(err) && err.message === 'Request timed out.';
  if (isAbort || isTimeoutMsg) {
    return TIMEOUT_HINT;
  }
  if (isAPIError(err) && err.status === 429) {
    return formatCreateTeamError(err, slug);
  }
  if (isAPIError(err) && err.status === 400) {
    const msg = (err.serverMessage || err.message || '').toLowerCase();
    const slugHint =
      msg.includes('slug') || msg.includes('cannot be used')
        ? `That team URL (vercel.com/${slug}) is not available. It may already be taken. `
        : '';
    const paymentHint = msg.includes('payment')
      ? 'A payment method is required to create a team. '
      : '';
    const prefix = slugHint || paymentHint;
    return prefix
      ? `${prefix}${prefix.trim() ? '\n' : ''}${err.serverMessage || err.message}`
      : err.serverMessage || err.message;
  }
  return errorToString(err);
}

const VERCEL_ACCOUNT_BILLING_URL = 'https://vercel.com/account/billing';

function createTeamErrorReason(err: unknown): string {
  if (isAPIError(err) && err.status === 400) {
    const msg = (err.serverMessage || err.message || '').toLowerCase();
    if (msg.includes('payment')) return 'payment_required';
    if (msg.includes('slug') || msg.includes('cannot be used'))
      return 'slug_unavailable';
  }
  if (isAPIError(err) && err.status === 429) return 'rate_limited';
  if (
    isError(err) &&
    ((err as Error & { name?: string }).name === 'AbortError' ||
      err.message === 'Request timed out.')
  ) {
    return 'timeout';
  }
  return 'team_creation_failed';
}

export default async function add(
  client: Client,
  argv: string[] = []
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(addSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'invalid_arguments',
          message: error instanceof Error ? error.message : String(error),
        },
        1
      );
    }
    printError(error);
    return 1;
  }

  const slugFlag = parsedArgs.flags['--slug'] as string | undefined;
  const nameFlag = parsedArgs.flags['--name'] as string | undefined;

  if (client.nonInteractive) {
    const missing: string[] = [];
    if (!slugFlag || !slugFlag.trim()) missing.push('--slug');
    if (!nameFlag || !nameFlag.trim()) missing.push('--name');
    if (missing.length > 0) {
      const fullArgs = client.argv.slice(2);
      const addIdx = fullArgs.indexOf('add');
      const afterAdd = addIdx >= 0 ? fullArgs.slice(addIdx + 1) : [];
      // Same subcommand (teams add): preserve --slug/--name and globals so
      // the user can re-run with placeholders filled without retyping flags.
      const flagParts = getSameSubcommandSuggestionFlags(afterAdd);
      const cmd = getCommandNamePlain(
        `teams add --slug <slug> --name <name> ${flagParts.join(' ')}`.trim()
      );
      // Plain text only—no param()/chalk in JSON message
      const requiredPlain = missing.join(' and ');
      const verb = missing.length === 1 ? 'is' : 'are';
      outputActionRequired(
        client,
        {
          status: 'action_required',
          reason: 'missing_arguments',
          action: 'missing_arguments',
          message: `In non-interactive mode ${requiredPlain} ${verb} required. Run: ${cmd}`,
          next: [
            {
              command: cmd,
              when: 'to create a team non-interactively',
            },
          ],
        },
        1
      );
    }
    const slug = (slugFlag as string).trim().toLowerCase();
    const name = (nameFlag as string).trim();
    if (!validateSlug(slug)) {
      const msg = `Invalid ${param('--slug')}: must start with a letter and contain only lowercase letters, numbers, hyphens, and underscores (e.g. ${param('acme')})`;
      const msgPlain =
        'Invalid --slug: must start with a letter and contain only lowercase letters, numbers, hyphens, and underscores (e.g. acme)';
      if (client.nonInteractive) {
        outputAgentError(
          client,
          {
            status: 'error',
            reason: 'invalid_slug',
            message: msgPlain,
            next: [
              {
                command: getCommandNamePlain(
                  'teams add --slug <slug> --name <name>'
                ),
              },
            ],
          },
          1
        );
      }
      output.error(msg);
      return 1;
    }
    if (!validateName(name)) {
      const msg = `Invalid ${param('--name')}: only letters, numbers, spaces, hyphens, and underscores allowed`;
      const msgPlain =
        'Invalid --name: only letters, numbers, spaces, hyphens, and underscores allowed';
      if (client.nonInteractive) {
        outputAgentError(
          client,
          {
            status: 'error',
            reason: 'invalid_name',
            message: msgPlain,
          },
          1
        );
      }
      output.error(msg);
      return 1;
    }

    output.spinner(teamUrlPrefix + slug);
    let team;
    try {
      team = await createTeamWithTimeout(client, slug);
    } catch (err: unknown) {
      output.stopSpinner();
      if (client.nonInteractive) {
        let message = formatCreateTeamErrorPlain(err, slug);
        const reason = createTeamErrorReason(err);
        const next: Array<{ command: string; when?: string }> = [];
        if (reason === 'payment_required') {
          message += ` Add a payment method at ${VERCEL_ACCOUNT_BILLING_URL}, then retry.`;
          next.push({
            command: openUrlInBrowserCommand(VERCEL_ACCOUNT_BILLING_URL),
            when: 'To open the billing page in your browser',
          });
        }
        outputAgentError(
          client,
          {
            status: 'error',
            reason,
            message,
            ...(next.length > 0 && { next }),
          },
          1
        );
      }
      output.error(formatCreateTeamError(err, slug));
      return 1;
    }
    output.stopSpinner();

    output.spinner(teamNamePrefix + name);
    try {
      const res = await patchTeam(client, team.id, { name });
      team = Object.assign(team, res);
    } catch (err: unknown) {
      output.stopSpinner();
      if (client.nonInteractive) {
        outputAgentError(
          client,
          {
            status: 'error',
            reason: 'team_update_failed',
            message: errorToString(err),
          },
          1
        );
      }
      output.error(errorToString(err));
      return 1;
    }
    output.stopSpinner();

    client.config.currentTeam = team.id;
    writeToConfigFile(client.config);
    output.success(
      `Team ${chalk.bold(team.name)} (${chalk.cyan(`vercel.com/${slug}`)}) created.`
    );
    return 0;
  }

  let slug: string | undefined = slugFlag?.trim().toLowerCase();
  let team;
  let elapsed;

  output.log(
    `Pick a team identifier for its URL (e.g.: ${chalk.cyan(
      '`vercel.com/acme`'
    )})`
  );
  do {
    try {
      slug = await client.input.text({
        message: `- ${teamUrlPrefix}`,
        validate: validateSlug,
        default: slug,
      });
    } catch (err: unknown) {
      if (isError(err) && err.message === 'USER_ABORT') {
        output.log('Canceled');
        return 0;
      }

      throw err;
    }

    elapsed = stamp();
    output.spinner(teamUrlPrefix + slug);

    try {
      team = await createTeamWithTimeout(client, slug!);
    } catch (err: unknown) {
      output.stopSpinner();
      output.print(eraseLines(2));
      output.error(formatCreateTeamError(err, slug!));
      // Clear failed slug so next prompt doesn't default to it and cause a loop
      slug = undefined;
    }
  } while (!team);

  output.stopSpinner();
  process.stdout.write(eraseLines(2));

  output.success(`Team created ${elapsed()}`);
  output.log(`${chalk.cyan(`${chars.tick} `) + teamUrlPrefix + slug}\n`);
  output.log('Pick a display name for your team');

  let name: string | undefined = nameFlag?.trim();

  try {
    name = await client.input.text({
      message: `- ${teamNamePrefix}`,
      validate: validateName,
      default: name,
    });
  } catch (err: unknown) {
    if (isError(err) && err.message === 'USER_ABORT') {
      output.log('No name specified');
      return 2;
    }

    throw err;
  }

  elapsed = stamp();
  output.spinner(teamNamePrefix + name);

  const res = await patchTeam(client, team.id, { name: name! });

  output.stopSpinner();
  process.stdout.write(eraseLines(2));

  team = Object.assign(team, res);

  output.success(`Team name saved ${elapsed()}`);
  output.log(`${chalk.cyan(`${chars.tick} `) + teamNamePrefix + team.name}\n`);

  // Update config file
  output.spinner('Saving');
  client.config.currentTeam = team.id;
  writeToConfigFile(client.config);
  output.stopSpinner();

  await invite(client, [], {
    introMsg: 'Invite your teammates! When done, press enter on an empty field',
    noopMsg: `You can invite teammates later by running ${getCommandName(
      `teams invite`
    )}`,
  });

  return 0;
}
