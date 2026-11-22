import chalk from 'chalk';
import type Client from '../../util/client';
import { getCommandName } from '../../util/pkg-name';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import { AGENT_REASON } from '../../util/agent-output-constants';
import {
  FLAG_ATTRIBUTE_TYPES,
  type FlagAttributeType,
} from '../../util/flags/attribute-types';
import {
  defaultEntityLabel,
  findEntity,
  parseAttributeInputs,
  validateAttributeKey,
  validateEntities,
  validateEntityKind,
  validateEntityLabel,
  type ParsedAttributeInput,
} from '../../util/flags/entity-input';
import {
  getFlagSettings,
  updateFlagSettings,
} from '../../util/flags/get-flags';
import output from '../../output-manager';
import { entitiesCreateSubcommand } from './command';
import type { FlagSettingsEntity } from '../../util/flags/types';
import { getProjectNameFromFlags } from './project';
import {
  entityAgentError,
  parseEntityArguments,
  isExitCodeResult,
  printEntityDetails,
  resolveEntitiesProject,
} from './entities-common';

export default async function entitiesCreate(
  client: Client,
  argv: string[]
): Promise<number> {
  const parsedArgs = parseEntityArguments(
    client,
    argv,
    entitiesCreateSubcommand.options
  );

  const { args, flags } = parsedArgs;
  const [kind] = args;
  let label = (flags['--label'] as string | undefined)?.trim();
  const attributeInputs = (flags['--attribute'] as string[] | undefined) ?? [];
  const json = flags['--json'] as boolean | undefined;
  const projectName = getProjectNameFromFlags(flags);

  if (!kind) {
    if (client.nonInteractive) {
      entityAgentError(client, {
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message: 'Provide an entity kind to create.',
        next: [
          {
            command:
              'flags entities create <kind> --label <label> --attribute <key>:<type>',
            when: 'create an entity with explicit attributes',
          },
        ],
      });
      return 2;
    }
    output.fatal('Provide a kind for the entity');
    output.log(
      `Example: ${getCommandName('flags entities create user --label User --attribute id:string')}`
    );
    return 2;
  }

  let attributes: ParsedAttributeInput[];
  try {
    validateEntityKind(kind);
    if (label !== undefined) {
      validateEntityLabel(label);
    }
    attributes = parseAttributeInputs(attributeInputs);
  } catch (err) {
    output.fatal((err as Error).message);
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

  if (findEntity(settings.entities, kind)) {
    output.fatal(
      `Entity ${chalk.bold(kind)} already exists. Run ${getCommandName(`flags entities update ${kind}`)} to change it.`
    );
    return 1;
  }

  const willPrompt =
    client.stdin.isTTY &&
    !client.nonInteractive &&
    (label === undefined || attributes.length === 0);
  if (willPrompt) {
    printAlignedLabel('Project', projectSlugLink);
  }
  label = await resolveEntityLabel(client, label, kind);
  if (attributes.length === 0 && client.stdin.isTTY && !client.nonInteractive) {
    attributes = await collectAttributesInteractively(client);
  }

  // Do not replace changes made by another editor while a prompt was open.
  if (willPrompt) {
    settings = await getFlagSettings(client, project.id);
  }
  const entity: FlagSettingsEntity = { kind, label, attributes };
  const entities = [...settings.entities, entity];
  try {
    validateEntityLabel(label);
    validateEntities(entities);
  } catch (err) {
    output.fatal((err as Error).message);
    return 1;
  }

  output.spinner('Creating entity…');
  const updated = await updateFlagSettings(client, project.id, { entities });
  output.stopSpinner();

  const created = findEntity(updated.entities, kind) ?? entity;

  if (json) {
    client.stdout.write(`${JSON.stringify({ entity: created }, null, 2)}\n`);
    return 0;
  }

  output.success(`Feature flag entity ${chalk.bold(created.kind)} created`);
  printEntityDetails(created, projectSlugLink);

  return 0;
}

async function resolveEntityLabel(
  client: Client,
  label: string | undefined,
  kind: string
): Promise<string> {
  if (label) {
    return label;
  }

  const defaultLabel = defaultEntityLabel(kind);
  if (client.stdin.isTTY && !client.nonInteractive) {
    const response = await client.input.text({
      message: `Enter a label for this entity (press Enter for "${defaultLabel}"):`,
    });
    return response.trim() || defaultLabel;
  }

  return defaultLabel;
}

async function collectAttributesInteractively(
  client: Client
): Promise<ParsedAttributeInput[]> {
  const attributes: ParsedAttributeInput[] = [];
  let addAnother = await client.input.confirm('Add attributes now?', true);

  while (addAnother) {
    const key = await client.input.text({
      message: 'Attribute key (for example plan):',
      validate: value => {
        try {
          validateAttributeKey(value.trim());
        } catch (err) {
          return (err as Error).message;
        }
        if (attributes.some(attribute => attribute.key === value.trim())) {
          return `Attribute "${value.trim()}" is already added.`;
        }
        return true;
      },
    });
    const type = await client.input.select<FlagAttributeType>({
      message: 'Attribute type:',
      choices: FLAG_ATTRIBUTE_TYPES.map(value => ({ name: value, value })),
    });
    attributes.push({ key: key.trim(), type });

    addAnother = await client.input.confirm('Add another attribute?', false);
  }

  return attributes;
}
