import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { writeJsonError } from '../../util/observability/jsonl';
import { getCommandNamePlain } from '../../util/pkg-name';
import { recordCliError } from '../../util/telemetry/cli-error';
import { HealthTelemetryClient } from '../../util/telemetry/commands/health';
import output from '../../output-manager';
import { warnDeprecatedSubcommand } from '../../util/warn-deprecated-subcommand';
import { healthCommand } from './command';
import { formatStatusReport, toSafeLine } from './format';
import {
  getStatusReport,
  STATUS_PAGE_HOST,
  STATUS_PAGE_URL,
  StatusPageError,
} from './statuspage';

interface Failure {
  reason: string;
  message: string;
  detail?: string;
  retryable?: boolean;
}

function describeFailure(err: unknown): Failure {
  if (!(err instanceof StatusPageError)) throw err;
  switch (err.kind) {
    case 'network':
      return {
        reason: AGENT_REASON.NETWORK_ERROR,
        message: err.detail.timedOut
          ? `Couldn't reach ${STATUS_PAGE_HOST}. The request timed out.`
          : `Couldn't reach ${STATUS_PAGE_HOST}. The connection failed.`,
        retryable: true,
      };
    case 'rate_limited':
      return {
        reason: AGENT_REASON.RATE_LIMITED,
        message: `Too many requests to ${STATUS_PAGE_HOST}. Try again in a minute.`,
        retryable: true,
      };
    case 'http':
      return {
        reason: AGENT_REASON.API_ERROR,
        message: `Failed to get the Vercel status. ${STATUS_PAGE_HOST} returned an error.`,
        detail: err.detail.httpStatus
          ? `HTTP status ${err.detail.httpStatus}`
          : undefined,
        retryable: true,
      };
    case 'invalid':
      return {
        reason: AGENT_REASON.API_ERROR,
        message: `Failed to get the Vercel status. ${STATUS_PAGE_HOST} returned an unexpected response.`,
        retryable: false,
      };
  }
}

export default async function health(client: Client): Promise<number> {
  const telemetry = new HealthTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });
  const argv = client.argv.slice(2);
  let jsonOutput = argv.includes('--json');

  /**
   * Reports a failure as one JSON document on stderr with `--json`, otherwise
   * as a human error. Usage errors point to help; the rest to the status page.
   */
  const fail = (failure: Failure, usage = false): number => {
    if (jsonOutput) {
      return writeJsonError(client, {
        status: 'error',
        reason: failure.reason,
        message: failure.message,
        ...(failure.retryable !== undefined && {
          retryable: failure.retryable,
        }),
        ...(usage && {
          next: [{ command: getCommandNamePlain('health --help') }],
        }),
        ...(failure.detail && { data: { detail: failure.detail } }),
      });
    }
    recordCliError({ code: failure.reason });
    output.fatal(failure.message);
    if (failure.detail) output.print(`  ${failure.detail}\n`);
    output.print(
      usage
        ? `\n  See all options:\n    ${getCommandNamePlain('health --help')}\n`
        : `\n  Check the status page in a browser:\n    ${STATUS_PAGE_URL}\n`
    );
    return usage ? 2 : 1;
  };

  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(healthCommand.options)
    );
  } catch (err) {
    return fail(
      {
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: err instanceof Error ? err.message : String(err),
      },
      true
    );
  }

  jsonOutput = parsedArgs.flags['--json'] === true;
  telemetry.trackCliFlagJson(parsedArgs.flags['--json']);

  if (parsedArgs.args[0] === 'status-page') {
    warnDeprecatedSubcommand(client, 'status-page', 'health');
  }

  // args[0] is `health`; the command takes no arguments.
  const extra = parsedArgs.args.slice(1);
  if (extra.length > 0) {
    return fail(
      {
        reason: AGENT_REASON.UNKNOWN_COMMAND,
        message: `Unknown command ${toSafeLine(extra[0])} for vercel health.`,
      },
      true
    );
  }

  if (!jsonOutput) {
    output.spinner('Getting the Vercel status…');
  }
  let report;
  try {
    report = await getStatusReport();
  } catch (err) {
    // `output.fatal` stops the spinner.
    return fail(describeFailure(err));
  }
  output.stopSpinner();

  client.stdout.write(
    jsonOutput
      ? `${JSON.stringify(report, null, 2)}\n`
      : // A blank line after the version banner, like `teams list`.
        `\n${formatStatusReport(report, Date.now())}`
  );
  return 0;
}
