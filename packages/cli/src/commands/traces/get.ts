import type Client from '../../util/client';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { help } from '../help';
import { getSubcommand, tracesCommand } from './command';
import { fetchTrace } from './fetch-trace';
import { renderMarkdown } from './render-markdown';
import { resolveScope } from './scope-resolver';
import type { TracesTelemetryClient } from '../../util/telemetry/commands/traces';

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

  const positional = parsedArgs.args.slice(1);
  const requestId =
    positional[0] === getSubcommand.name ? positional[1] : positional[0];
  const json = parsedArgs.flags['--json'];
  const scopeFlag = parsedArgs.flags['--scope'];
  const projectFlag = parsedArgs.flags['--project'];

  telemetry.trackCliArgumentRequestId(requestId);
  telemetry.trackCliFlagJson(json);
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

  let teamId: string;
  let projectId: string;
  if (scopeFlag && projectFlag) {
    teamId = scopeFlag;
    projectId = projectFlag;
  } else {
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
    teamId = scope.teamId;
    projectId = scope.projectId;
  }

  output.spinner('Fetching trace…');
  let trace;
  try {
    ({ trace } = await fetchTrace({
      client,
      teamId,
      projectId,
      requestId,
    }));
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }
  output.stopSpinner();

  if (json) {
    client.stdout.write(`${JSON.stringify(trace, null, 2)}\n`);
    return 0;
  }

  client.stdout.write(renderMarkdown(trace, { requestId }));
  output.log('Run with --json for full trace data.');
  return 0;
}
