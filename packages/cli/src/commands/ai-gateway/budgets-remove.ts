import chalk from 'chalk';
import type Client from '../../util/client';
import {
  removeBudget,
  type BudgetScopeType,
} from '../../util/ai-gateway/budgets';
import { ensureTeam } from '../../util/ai-gateway/ensure-team';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import { ProjectNotFound } from '../../util/errors-ts';
import stamp from '../../util/output/stamp';
import output from '../../output-manager';
import { AiGatewayBudgetsRemoveTelemetryClient } from '../../util/telemetry/commands/ai-gateway/budgets-remove';
import { budgetsRemoveSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { validateJsonOutput } from '../../util/output-format';

export default async function remove(client: Client, argv: string[]) {
  const telemetry = new AiGatewayBudgetsRemoveTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    budgetsRemoveSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { flags: opts } = parsedArgs;

  const project = opts['--project'] as string | undefined;
  const scope: BudgetScopeType = project ? 'project' : 'team';
  const yes = opts['--yes'] as boolean | undefined;

  telemetry.trackCliOptionProject(project);
  telemetry.trackCliFlagYes(yes);
  telemetry.trackCliOptionFormat(opts['--format']);

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  if (!(await ensureTeam(client))) {
    return 1;
  }

  let projectId: string | undefined;
  if (scope === 'project' && project) {
    const resolved = await getProjectByNameOrId(client, project);
    if (resolved instanceof ProjectNotFound) {
      output.error(`Project not found: ${project}`);
      return 1;
    }
    projectId = resolved.id;
  }

  const target =
    scope === 'team'
      ? 'the team budget'
      : `the budget for ${chalk.bold(project ?? '')}`;

  if (!yes) {
    if (!client.stdin.isTTY) {
      output.error('To remove in non-interactive mode, re-run with --yes.');
      return 1;
    }
    const confirmed = await client.input.confirm(`Remove ${target}?`, false);
    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }
  }

  const removeStamp = stamp();
  output.spinner('Removing budget');

  try {
    await removeBudget(client, scope, projectId);
    output.stopSpinner();
    if (asJson) {
      client.stdout.write(
        `${JSON.stringify(
          {
            scopeType: scope,
            ...(projectId ? { projectId } : {}),
            removed: true,
          },
          null,
          2
        )}\n`
      );
    } else {
      output.success(`Removed ${target} ${removeStamp()}`);
    }
    return 0;
  } catch (err: unknown) {
    output.stopSpinner();
    if (isAPIError(err)) {
      output.error(err.message);
      return 1;
    }
    throw err;
  }
}
