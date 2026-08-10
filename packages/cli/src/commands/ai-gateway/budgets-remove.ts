import chalk from 'chalk';
import type Client from '../../util/client';
import { removeBudget, parseBudgetScope } from '../../util/ai-gateway/budgets';
import { ensureTeam } from '../../util/ai-gateway/ensure-team';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import {
  getTeamMemberByIdentifier,
  teamMemberLabel,
} from '../../util/teams/get-team-member';
import { ProjectNotFound } from '../../util/errors-ts';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
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
  const { args, flags: opts } = parsedArgs;

  const yes = opts['--yes'] as boolean | undefined;

  telemetry.trackCliArgumentScope(args[0]);
  telemetry.trackCliArgumentName(args[1]);
  telemetry.trackCliFlagYes(yes);
  telemetry.trackCliOptionFormat(opts['--format']);

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const scopeResult = parseBudgetScope(args);
  if ('error' in scopeResult) {
    output.error(scopeResult.error);
    return 1;
  }
  const { scope } = scopeResult;

  if (!(await ensureTeam(client))) {
    return 1;
  }

  let projectId: string | undefined;
  let userId: string | undefined;
  let targetName = scope.scopeType === 'team' ? undefined : scope.name;
  if (scope.scopeType === 'project') {
    const resolved = await getProjectByNameOrId(client, scope.name);
    if (resolved instanceof ProjectNotFound) {
      output.error(`Project not found: ${scope.name}`);
      return 1;
    }
    projectId = resolved.id;
  } else if (scope.scopeType === 'user') {
    const member = await getTeamMemberByIdentifier(
      client,
      client.config.currentTeam as string,
      scope.name
    );
    if (!member) {
      output.error(`Team member not found: ${scope.name}`);
      return 1;
    }
    userId = member.uid;
    targetName = teamMemberLabel(member);
  }

  const target =
    scope.scopeType === 'team'
      ? 'the team budget'
      : `the budget for ${chalk.bold(targetName as string)}`;

  if (!yes) {
    if (client.nonInteractive) {
      output.error('To remove in non-interactive mode, re-run with --yes.');
      return 1;
    }
    const confirmed = await client.input.confirm(`Remove ${target}?`, false);
    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }
  }

  output.spinner('Removing budget…');

  try {
    await removeBudget(client, scope.scopeType, { projectId, userId });
    output.stopSpinner();
    if (asJson) {
      client.stdout.write(
        `${JSON.stringify(
          {
            scopeType: scope.scopeType,
            ...(projectId ? { projectId } : {}),
            ...(userId ? { userId } : {}),
            removed: true,
          },
          null,
          2
        )}\n`
      );
    } else {
      const removedValue =
        scope.scopeType === 'team' ? 'team budget' : `budget for ${targetName}`;
      printAlignedLabel('Removed', removedValue, { gutter: '✓' });
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
