import type Client from '../../util/client';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { help } from '../help';
import { getSubcommand, tracesCommand } from './command';
import { renderSummary } from './render-summary';
import { resolveScope } from './scope-resolver';
import type { Trace } from './types';
import type { TracesTelemetryClient } from '../../util/telemetry/commands/traces';

type GetTraceResponse = {
  trace: Trace;
};

export default async function get(
  client: Client,
  telemetry: TracesTelemetryClient
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(getSubcommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  // `parsedArgs.args[0]` is the command name (`traces`). The next slot may be
  // the subcommand keyword (`get`) or the positional `requestId` (since `get`
  // is the default subcommand). Skip the keyword when present.
  const positional = parsedArgs.args.slice(1);
  const requestId = positional[0] === 'get' ? positional[1] : positional[0];
  const json = parsedArgs.flags['--json'];
  const scopeFlag = parsedArgs.flags['--scope'];
  const projectFlag = parsedArgs.flags['--project'];

  telemetry.trackCliArgumentRequestId(requestId);
  telemetry.trackCliFlagJson(json);
  // `--scope` is tracked globally in `src/index.ts`; only project is local.
  telemetry.trackCliOptionProject(projectFlag);

  if (!requestId) {
    output.print(
      help(getSubcommand, {
        parent: tracesCommand,
        columns: client.stderr.columns,
      })
    );
    return 2;
  }

  const linkedProject = await getLinkedProject(client);
  if (linkedProject.status === 'error') {
    return linkedProject.exitCode;
  }

  const scope = resolveScope({
    flags: { scope: scopeFlag, project: projectFlag },
    linkedProject,
  });
  if ('message' in scope) {
    output.error(scope.message);
    return 1;
  }

  const search = new URLSearchParams({
    teamId: scope.teamId,
    projectId: scope.projectId,
    requestId,
  });
  const url = `/api/v1/projects/traces?${search.toString()}`;

  output.spinner('Fetching trace…');
  let response: GetTraceResponse;
  try {
    response = await client.fetch<GetTraceResponse>(url);
  } catch (err) {
    printError(err);
    return 1;
  }
  // The spinner must be stopped manually before writing to stdout — only the
  // `output.*` helpers (which go through `print()`) clear it implicitly.
  output.stopSpinner();

  const { trace } = response;

  if (json) {
    client.stdout.write(`${JSON.stringify(trace, null, 2)}\n`);
    return 0;
  }

  client.stdout.write(`${renderSummary(trace, { requestId })}\n`);
  output.log('Run with --json for full trace data.');
  return 0;
}
