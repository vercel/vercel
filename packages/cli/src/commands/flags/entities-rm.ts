import chalk from 'chalk';
import plural from 'pluralize';
import { quoteArg } from '../../util/flags/quote-arg';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import type Client from '../../util/client';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { findEntity } from '../../util/flags/entity-input';
import {
  collectEntityUsage,
  loadEntityUsageSources,
} from '../../util/flags/entity-usage';
import {
  getFlagSettings,
  updateFlagSettings,
} from '../../util/flags/get-flags';
import output from '../../output-manager';
import { entitiesRemoveSubcommand } from './command';
import { getProjectNameFromFlags } from './project';
import {
  entityAgentError,
  parseEntityArguments,
  isExitCodeResult,
  reportEntityInUse,
  reportEntityNotFound,
  resolveEntitiesProject,
  selectEntityKind,
} from './entities-common';

export default async function entitiesRm(
  client: Client,
  argv: string[]
): Promise<number> {
  const parsedArgs = parseEntityArguments(
    client,
    argv,
    entitiesRemoveSubcommand.options
  );

  const { args, flags } = parsedArgs;
  if (args.length > 1) {
    const message = 'Provide only one entity kind to delete.';
    entityAgentError(client, {
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message,
      next: [
        {
          command: 'flags entities delete <kind> --yes',
          when: 'replace <kind> with the single entity kind to delete',
        },
      ],
    });
    if (!client.nonInteractive) {
      output.fatal(message);
    }
    return 2;
  }
  let kind: string | undefined = args[0];
  const skipConfirmation = flags['--yes'] as boolean | undefined;
  const projectName = getProjectNameFromFlags(flags);

  if (client.nonInteractive || !client.stdin.isTTY) {
    if (!kind) {
      await selectEntityKind(
        client,
        [],
        'delete',
        'flags entities delete <kind> --yes'
      );
      return 2;
    }
    if (!skipConfirmation) {
      reportMissingConfirmation(client, kind);
      return 1;
    }
  }

  const context = await resolveEntitiesProject(client, projectName);
  if (isExitCodeResult(context)) {
    return context.exitCode;
  }

  const { project, projectSlugLink } = context;

  output.spinner('Fetching feature flag settings…');
  let settings = await getFlagSettings(client, project.id);
  let prompted = false;
  output.stopSpinner();

  if (!kind) {
    printAlignedLabel('Project', projectSlugLink);
    kind = await selectEntityKind(
      client,
      settings.entities,
      'delete',
      'flags entities delete <kind> --yes'
    );
    prompted = true;
    if (!kind) {
      return 1;
    }
  }

  const entity = findEntity(settings.entities, kind);
  if (!entity) {
    reportEntityNotFound(client, kind, 'flags entities delete <kind> --yes');
    return 1;
  }

  if (!skipConfirmation) {
    if (!prompted) {
      printAlignedLabel('Project', projectSlugLink);
    }
    const confirmed = await client.input.confirm(
      `Delete entity ${chalk.bold(entity.kind)} and its ${plural('attribute', entity.attributes.length, true)}?`,
      false
    );

    prompted = true;
    if (!confirmed) {
      output.log('Aborted');
      return 0;
    }
  }

  // Refresh after every prompt before replacing the full schema. Then check
  // references, including any added while the confirmation was open.
  if (prompted) {
    settings = await getFlagSettings(client, project.id);
    if (!findEntity(settings.entities, kind)) {
      reportEntityNotFound(client, kind, 'flags entities delete <kind> --yes');
      return 1;
    }
  }

  output.spinner('Checking flags and segments for references…');
  const sources = await loadEntityUsageSources(client, project.id);
  output.stopSpinner();
  if (
    reportEntityInUse(client, {
      kind,
      usage: collectEntityUsage(sources, kind),
      retryCommand: `flags entities delete ${quoteArg(kind)} --yes`,
    })
  ) {
    return 1;
  }

  output.spinner('Deleting entity…');
  await updateFlagSettings(client, project.id, {
    entities: settings.entities.filter(candidate => candidate.kind !== kind),
  });
  output.stopSpinner();

  output.success(`Feature flag entity ${chalk.bold(entity.kind)} deleted`);

  return 0;
}

function reportMissingConfirmation(client: Client, kind: string): void {
  entityAgentError(client, {
    reason: AGENT_REASON.CONFIRMATION_REQUIRED,
    message: `Add --yes to delete entity ${kind}.`,
    next: [
      {
        command: `flags entities delete ${quoteArg(kind)} --yes`,
        when: 'delete the entity',
      },
    ],
  });
  if (!client.nonInteractive) {
    output.fatal(
      'Missing required option --yes. Add --yes to delete the entity without prompting.'
    );
  }
}
