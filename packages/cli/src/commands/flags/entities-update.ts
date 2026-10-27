import chalk from 'chalk';
import type Client from '../../util/client';
import { getCommandName } from '../../util/pkg-name';
import { quoteArg } from '../../util/flags/quote-arg';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import { AGENT_REASON } from '../../util/agent-output-constants';
import {
  findAttribute,
  findEntity,
  parseAttributeInputs,
  validateAttributeKey,
  validateEntities,
  validateEntityLabel,
  type ParsedAttributeInput,
} from '../../util/flags/entity-input';
import {
  collectEntityUsage,
  loadEntityUsageSources,
} from '../../util/flags/entity-usage';
import {
  getFlagSettings,
  updateFlagSettings,
} from '../../util/flags/get-flags';
import output from '../../output-manager';
import { entitiesUpdateSubcommand } from './command';
import type { FlagSettingsEntity } from '../../util/flags/types';
import { getProjectNameFromFlags } from './project';
import {
  entityAgentError,
  parseEntityArguments,
  isExitCodeResult,
  printEntityDetails,
  reportEntityInUse,
  reportEntityNotFound,
  resolveEntitiesProject,
  selectEntityKind,
} from './entities-common';

interface EntityChanges {
  label?: string;
  addAttributes: ParsedAttributeInput[];
  removeAttributes: string[];
  setAttributeTypes: ParsedAttributeInput[];
}

export default async function entitiesUpdate(
  client: Client,
  argv: string[]
): Promise<number> {
  const parsedArgs = parseEntityArguments(
    client,
    argv,
    entitiesUpdateSubcommand.options
  );

  const { args, flags } = parsedArgs;
  let kind: string | undefined = args[0];
  const label = (flags['--label'] as string | undefined)?.trim();
  const addInputs = (flags['--add-attribute'] as string[] | undefined) ?? [];
  const removeInputs =
    (flags['--remove-attribute'] as string[] | undefined) ?? [];
  const setTypeInputs =
    (flags['--set-attribute-type'] as string[] | undefined) ?? [];
  const json = flags['--json'] as boolean | undefined;
  const projectName = getProjectNameFromFlags(flags);

  let changes: EntityChanges;
  try {
    changes = parseChanges({ label, addInputs, removeInputs, setTypeInputs });
  } catch (err) {
    output.fatal((err as Error).message);
    return 2;
  }

  const hasChanges =
    changes.label !== undefined ||
    changes.addAttributes.length > 0 ||
    changes.removeAttributes.length > 0 ||
    changes.setAttributeTypes.length > 0;

  if (!hasChanges) {
    if (client.nonInteractive) {
      entityAgentError(client, {
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message:
          'Provide at least one entity update option, such as --label, --add-attribute, --remove-attribute, or --set-attribute-type.',
        next: [
          {
            command:
              'flags entities update <kind> --add-attribute <key>:<type>',
            when: 'add an attribute to an entity',
          },
          {
            command: 'flags entities update <kind> --remove-attribute <key>',
            when: 'remove an attribute from an entity',
          },
          {
            command: 'flags entities ls --json',
            when: 'inspect the current entities first',
          },
        ],
      });
      return 2;
    }
    output.fatal(
      'Provide at least one change: --label, --add-attribute, --remove-attribute, or --set-attribute-type'
    );
    output.log(
      `Example: ${getCommandName('flags entities update user --add-attribute email:string')}`
    );
    return 2;
  }

  const context = await resolveEntitiesProject(client, projectName);
  if (isExitCodeResult(context)) {
    return context.exitCode;
  }

  const { project, projectSlugLink } = context;

  output.spinner('Fetching feature flag settings…');
  let settings = await getFlagSettings(client, project.id);
  output.stopSpinner();

  if (!kind) {
    if (client.stdin.isTTY && !client.nonInteractive) {
      printAlignedLabel('Project', projectSlugLink);
    }
    kind = await selectEntityKind(
      client,
      settings.entities,
      'update',
      buildRetryCommand(undefined, changes)
    );
    if (!kind) {
      // Without a terminal, no kind is a missing argument.
      return client.nonInteractive || !client.stdin.isTTY ? 2 : 1;
    }
    // Entity selection can leave the original snapshot stale.
    settings = await getFlagSettings(client, project.id);
  }

  const entity = findEntity(settings.entities, kind);
  if (!entity) {
    reportEntityNotFound(client, kind, buildRetryCommand(undefined, changes));
    return 1;
  }

  const retryCommand = buildRetryCommand(kind, changes);
  for (const attribute of changes.addAttributes) {
    if (findAttribute(entity, attribute.key)) {
      output.fatal(
        `Attribute "${attribute.key}" already exists on entity "${entity.kind}". Use --set-attribute-type to change its type.`
      );
      return 1;
    }
  }
  for (const key of changes.removeAttributes) {
    if (!findAttribute(entity, key)) {
      output.fatal(`Attribute ${chalk.bold(`${kind}.${key}`)} does not exist.`);
      return 1;
    }
  }
  for (const attribute of changes.setAttributeTypes) {
    const existing = findAttribute(entity, attribute.key);
    if (!existing) {
      output.fatal(
        `Attribute ${chalk.bold(`${kind}.${attribute.key}`)} does not exist. Use --add-attribute to add it.`
      );
      return 1;
    }
  }

  const updatedEntity = applyChanges(entity, changes);
  const entities = settings.entities.map(candidate =>
    candidate.kind === kind ? updatedEntity : candidate
  );
  try {
    validateEntities(entities);
  } catch (err) {
    output.fatal((err as Error).message);
    return 1;
  }

  const typeChanges = changes.setAttributeTypes.filter(
    attribute => findAttribute(entity, attribute.key)?.type !== attribute.type
  );
  const guardedKeys = [
    ...changes.removeAttributes,
    ...typeChanges.map(attribute => attribute.key),
  ];
  if (guardedKeys.length > 0) {
    output.spinner('Checking flags and segments for references…');
    const sources = await loadEntityUsageSources(client, project.id);
    output.stopSpinner();
    for (const key of guardedKeys) {
      const usage = collectEntityUsage(sources, kind, key);
      if (
        reportEntityInUse(client, {
          kind,
          attribute: key,
          usage,
          retryCommand,
        })
      ) {
        return 1;
      }
    }
  }

  output.spinner('Updating entity…');
  const updated = await updateFlagSettings(client, project.id, { entities });
  output.stopSpinner();

  const result = findEntity(updated.entities, kind) ?? updatedEntity;

  if (json) {
    client.stdout.write(`${JSON.stringify({ entity: result }, null, 2)}\n`);
    return 0;
  }

  output.success(`Feature flag entity ${chalk.bold(result.kind)} updated`);
  printEntityDetails(result, projectSlugLink);

  return 0;
}

function parseChanges(input: {
  label?: string;
  addInputs: string[];
  removeInputs: string[];
  setTypeInputs: string[];
}): EntityChanges {
  if (input.label !== undefined) {
    validateEntityLabel(input.label);
  }
  const addAttributes = parseAttributeInputs(input.addInputs);
  const setAttributeTypes = parseAttributeInputs(input.setTypeInputs);
  const removeAttributes = input.removeInputs.map(value => value.trim());
  for (const key of removeAttributes) {
    validateAttributeKey(key);
  }

  const removed = new Set(removeAttributes);
  for (const attribute of [...addAttributes, ...setAttributeTypes]) {
    if (removed.has(attribute.key)) {
      throw new Error(
        `Attribute "${attribute.key}" can not be removed and changed in the same command.`
      );
    }
  }
  const added = new Set(addAttributes.map(attribute => attribute.key));
  for (const attribute of setAttributeTypes) {
    if (added.has(attribute.key)) {
      throw new Error(
        `Attribute "${attribute.key}" can not be added and have its type changed in the same command.`
      );
    }
  }

  return {
    label: input.label,
    addAttributes,
    removeAttributes,
    setAttributeTypes,
  };
}

function applyChanges(
  entity: FlagSettingsEntity,
  changes: EntityChanges
): FlagSettingsEntity {
  const removed = new Set(changes.removeAttributes);
  const typeByKey = new Map(
    changes.setAttributeTypes.map(attribute => [attribute.key, attribute.type])
  );

  return {
    ...entity,
    label: changes.label ?? entity.label,
    attributes: [
      ...entity.attributes
        .filter(attribute => !removed.has(attribute.key))
        .map(attribute => {
          const type = typeByKey.get(attribute.key);
          // Drop value labels when the attribute type changes.
          return type !== undefined && type !== attribute.type
            ? { key: attribute.key, type }
            : attribute;
        }),
      ...changes.addAttributes,
    ],
  };
}

function buildRetryCommand(
  kind: string | undefined,
  changes: EntityChanges
): string {
  const parts = [
    `flags entities update ${kind === undefined ? '<kind>' : quoteArg(kind)}`,
  ];
  if (changes.label !== undefined) {
    parts.push(`--label ${quoteArg(changes.label)}`);
  }
  for (const attribute of changes.addAttributes) {
    parts.push(
      `--add-attribute ${quoteArg(`${attribute.key}:${attribute.type}`)}`
    );
  }
  for (const key of changes.removeAttributes) {
    parts.push(`--remove-attribute ${quoteArg(key)}`);
  }
  for (const attribute of changes.setAttributeTypes) {
    parts.push(
      `--set-attribute-type ${quoteArg(`${attribute.key}:${attribute.type}`)}`
    );
  }
  return parts.join(' ');
}
