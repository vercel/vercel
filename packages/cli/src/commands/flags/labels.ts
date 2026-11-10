import type Client from '../../util/client';
import plural from 'pluralize';
import {
  AGENT_REASON,
  AGENT_STATUS,
  getExitCodeForReason,
} from '../../util/agent-output-constants';
import { buildCommandWithGlobalFlags } from '../../util/agent-output';
import { getGlobalFlagsFromArgs } from '../../util/arg-common';
import { getCommandNamePlain } from '../../util/pkg-name';
import { printNextPageCommand } from '../../util/pagination';
import { isAPIError } from '../../util/errors-ts';
import { getFlagSettings } from '../../util/flags/get-flags';
import {
  findAttribute,
  findEntity,
  validateAttributeKey,
  validateEntityKind,
} from '../../util/flags/entity-input';
import {
  parseEntityLabelOperations,
  validateEntityLabelOperations,
  updateEntityLabelsBulk,
} from '../../util/flags/entity-labels';
import {
  parseLabelPagination,
  paginateLabelItems,
} from '../../util/flags/label-pagination';
import { quoteArg } from '../../util/flags/quote-arg';
import formatTable from '../../util/format-table';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import output from '../../output-manager';
import { formatProject } from '../../util/projects/format-project';
import {
  flagsCommand,
  labelsListSubcommand,
  labelsSubcommand,
} from './command';
import { help } from '../help';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getSubcommand from '../../util/get-subcommand';
import { getCommandAliases } from '..';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import { FlagsLabelsTelemetryClient } from '../../util/telemetry/commands/flags/labels';
import { getLinkedFlagsProject, getProjectNameFromFlags } from './project';

export default async function labels(client: Client): Promise<number> {
  const argv = client.argv.slice(4);
  const telemetry = new FlagsLabelsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });
  let json = client.nonInteractive || argv.includes('--json');
  let inspectCommand = 'flags entities ls --json';
  let reason: string = AGENT_REASON.INVALID_ARGUMENTS;
  let recovery = 'Inspect entities and labels before retrying';

  function next() {
    return [
      {
        command: buildCommandWithGlobalFlags(
          client.argv,
          inspectCommand,
          undefined,
          {
            preserveProject: inspectCommand.startsWith('flags '),
          }
        ),
        when: recovery,
      },
    ];
  }

  function printRecovery() {
    output.print(`  ${recovery}:\n  ${next()[0].command}\n`);
  }

  function fail(message: string): number {
    if (json) {
      const status =
        reason === AGENT_REASON.MISSING_ARGUMENTS ||
        reason === AGENT_REASON.NOT_LINKED
          ? AGENT_STATUS.ACTION_REQUIRED
          : AGENT_STATUS.ERROR;
      client.stdout.write(
        `${JSON.stringify({ status, reason, message, next: next() }, null, 2)}\n`
      );
    } else {
      output.fatal(message);
      printRecovery();
    }
    return getExitCodeForReason(reason);
  }

  try {
    const parsed = parseArguments(
      argv,
      getFlagsSpecification(labelsListSubcommand.options),
      { permissive: true }
    );
    const aliases = Object.fromEntries(
      labelsSubcommand.subcommands.map(command => [
        command.name,
        getCommandAliases(command),
      ])
    );
    const { subcommand, subcommandOriginal } = getSubcommand(
      parsed.args,
      aliases
    );
    const command = labelsSubcommand.subcommands.find(
      command => command.name === subcommand
    );
    if (parsed.flags['--help']) {
      telemetry.trackCliFlagHelp(
        'flags labels',
        command ? subcommandOriginal : undefined
      );
      output.print(
        help(command ?? labelsSubcommand, {
          stream: client.stderr,
          parent: command
            ? { ...labelsSubcommand, name: 'flags labels' }
            : flagsCommand,
          columns: client.stderr.columns,
        })
      );
      return 0;
    }
    if (!command) {
      reason = parsed.args.length
        ? AGENT_REASON.INVALID_ARGUMENTS
        : AGENT_REASON.MISSING_ARGUMENTS;
      return fail(getInvalidSubcommand(aliases));
    }
    telemetry.trackSubcommand(command.name, subcommandOriginal);
    const { args: positional, flags } = parseArguments(
      argv,
      getFlagsSpecification(command.options)
    );
    const [target, ...args] = positional.slice(1);
    telemetry.trackArguments(positional.slice(1), flags);
    json = Boolean(flags['--json']) || client.nonInteractive;
    if (target === undefined && command.name !== 'ls') {
      reason = AGENT_REASON.MISSING_ARGUMENTS;
      return fail(
        'Provide an attribute as ENTITY.ATTRIBUTE. Example: vercel flags labels set user.plan pro "Pro Plan".'
      );
    }
    const [kind, attributeKey] = target?.split('.') ?? [];
    if (target !== undefined) {
      if (target.split('.').length !== 2) {
        return fail(
          'Use an attribute as ENTITY.ATTRIBUTE, for example user.plan.'
        );
      }
      validateEntityKind(kind);
      validateAttributeKey(attributeKey);
    }
    const pageOptions =
      command.name === 'ls'
        ? parseLabelPagination(
            flags['--limit'] as number | undefined,
            flags['--next'] as string | undefined,
            target ?? null
          )
        : undefined;
    if (args.length !== command.arguments.length - 1) {
      if (args.length < command.arguments.length - 1)
        reason = AGENT_REASON.MISSING_ARGUMENTS;
      return fail(
        command.name === 'set'
          ? 'Provide a value and a label. Example: vercel flags labels set user.plan pro "Pro Plan".'
          : command.name === 'remove'
            ? 'Provide one value. Example: vercel flags labels remove user.plan pro.'
            : `The ${command.name} command accepts only one attribute as ENTITY.ATTRIBUTE.`
      );
    }
    const operations =
      command.name === 'set'
        ? validateEntityLabelOperations([
            { operation: 'upsert', value: args[0], label: args[1] },
          ])
        : command.name === 'remove'
          ? validateEntityLabelOperations([
              { operation: 'delete', value: args[0] },
            ])
          : parseEntityLabelOperations({
              set: (flags['--set'] as string[] | undefined) ?? [],
              remove: (flags['--remove'] as string[] | undefined) ?? [],
              data: flags['--data'] as string | undefined,
            });
    if (command.name === 'apply' && operations.length === 0) {
      reason = AGENT_REASON.MISSING_ARGUMENTS;
      return fail('Provide --set VALUE=LABEL, --remove VALUE, or --data JSON.');
    }

    reason = AGENT_REASON.API_ERROR;
    const projectName = getProjectNameFromFlags(flags);
    const context = await getLinkedFlagsProject(client, projectName, {
      projectNotFoundHandling: 'return',
    });
    if (context.status === 'error') {
      inspectCommand = 'project ls';
      recovery = 'Check the project and team context before retrying';
      return fail(
        'Failed to resolve the project. Check the project and team settings.'
      );
    }
    if (context.status === 'not_linked') {
      reason = projectName
        ? AGENT_REASON.PROJECT_NOT_FOUND
        : AGENT_REASON.NOT_LINKED;
      inspectCommand = projectName ? 'project ls' : 'link';
      recovery = projectName
        ? 'Select an accessible project before retrying'
        : 'Link a project before retrying';
      return fail(
        projectName
          ? `Project ${JSON.stringify(projectName)} was not found or is not accessible. Check --project and your team scope.`
          : "Your codebase isn't linked to a project. Pass --project <name>, or run vercel link to link it."
      );
    }
    const { project, org } = context;
    client.config.currentTeam = org.type === 'team' ? org.id : undefined;
    if (pageOptions?.cursor && pageOptions.cursor.projectId !== project.id) {
      reason = AGENT_REASON.INVALID_ARGUMENTS;
      return fail(
        'The --next cursor belongs to a different project. Omit --next to restart the list.'
      );
    }
    const projectSlugLink = formatProject(org.slug, project.name);

    function printNextPage(cursor: string | null) {
      if (!json && cursor && pageOptions) {
        const globalArgs = getGlobalFlagsFromArgs(client.argv.slice(2));
        if (
          !globalArgs.some(
            arg =>
              arg === '--scope' || arg === '-S' || arg.startsWith('--scope=')
          )
        ) {
          globalArgs.push('--scope', org.slug);
        }
        const command = getCommandNamePlain(
          [
            'flags',
            'labels',
            'ls',
            ...(target === undefined ? [] : [target]),
            '--project',
            project.name,
            '--limit',
            String(pageOptions.limit),
            '--next',
            cursor,
            ...globalArgs,
          ]
            .map(quoteArg)
            .join(' ')
        );
        output.print('\n');
        printNextPageCommand(command);
      }
    }

    output.spinner('Fetching attribute labels…');
    const settings = await getFlagSettings(client, project.id);
    output.stopSpinner();
    if (pageOptions && target === undefined) {
      const available = settings.entities.flatMap(entity =>
        entity.attributes
          .filter(attribute => attribute.labels?.length)
          .map(attribute => ({
            id: null,
            attributes: [
              { entityKind: entity.kind, attributeKey: attribute.key },
            ],
            labelCount: attribute.labels!.length,
          }))
      );
      const { items: lists, pagination } = paginateLabelItems(
        available,
        pageOptions,
        project.id,
        null,
        list =>
          `${list.attributes[0].entityKind}.${list.attributes[0].attributeKey}`
      );
      if (json) {
        client.stdout.write(
          `${JSON.stringify({ status: AGENT_STATUS.OK, lists, pagination }, null, 2)}\n`
        );
      } else {
        printAlignedLabel('Project', projectSlugLink);
        if (lists.length === 0) {
          output.log(
            pageOptions.cursor
              ? 'No more label lists found.'
              : 'No label lists found.'
          );
        } else {
          const rows = lists.map(list => [
            `${list.attributes[0].entityKind}.${list.attributes[0].attributeKey}`,
            String(list.labelCount),
          ]);
          output.print(
            `\n${formatTable(['Attribute', 'Labels'], ['l', 'r'], [{ name: '', rows }])}\n`
          );
        }
      }
      printNextPage(pagination.next);
      return 0;
    }
    const entity = findEntity(settings.entities, kind);
    const attribute = entity && findAttribute(entity, attributeKey);
    if (!attribute) {
      reason = AGENT_REASON.NOT_FOUND;
      return fail(
        entity
          ? `Attribute ${kind}.${attributeKey} was not found in this project.`
          : `Entity ${kind} was not found in this project.`
      );
    }
    inspectCommand = `flags labels ls ${quoteArg(`${kind}.${attributeKey}`)} --json`;

    if (pageOptions) {
      const { items: labels, pagination } = paginateLabelItems(
        attribute.labels ?? [],
        pageOptions,
        project.id,
        `${kind}.${attributeKey}`,
        label => label.value
      );
      if (json) {
        client.stdout.write(
          `${JSON.stringify({ status: AGENT_STATUS.OK, entityKind: kind, attributeKey, labels, pagination }, null, 2)}\n`
        );
      } else {
        printAlignedLabel('Project', projectSlugLink);
        printAlignedLabel('Attribute', `${kind}.${attributeKey}`);
        if (labels.length === 0) {
          output.log(
            pageOptions.cursor
              ? 'No more value labels found.'
              : 'No value labels found.'
          );
        } else {
          const rows = labels.map(({ value, label }) => [
            formatLabelCell(value),
            formatLabelCell(label),
          ]);
          output.print(
            `\n${formatTable(['Value', 'Label'], ['l', 'l'], [{ name: '', rows }])}\n`
          );
        }
      }
      printNextPage(pagination.next);
      return 0;
    }

    if (attribute.type !== 'string' && attribute.type !== 'stringArray') {
      reason = AGENT_REASON.INVALID_ARGUMENTS;
      return fail(
        'Value labels are supported only for string and stringArray attributes.'
      );
    }

    if (!json) {
      printAlignedLabel('Project', projectSlugLink);
      printAlignedLabel('Attribute', `${kind}.${attributeKey}`);
    }
    output.spinner('Updating attribute labels…');
    const result = await updateEntityLabelsBulk(
      client,
      project.id,
      operations.map(operation => ({
        ...operation,
        entityKind: kind,
        attributeKey,
      }))
    );
    output.stopSpinner();
    const failed = result.errors.length > 0;
    const message = `${plural('label operation', result.labels.length, true)} applied, ${result.errors.length} failed.`;
    if (json) {
      client.stdout.write(
        `${JSON.stringify(
          {
            status: failed ? AGENT_STATUS.ERROR : AGENT_STATUS.OK,
            entityKind: kind,
            attributeKey,
            ...result,
            ...(failed
              ? { reason: AGENT_REASON.API_ERROR, message, next: next() }
              : {}),
          },
          null,
          2
        )}\n`
      );
    } else if (failed) {
      output.fatal(message);
      for (const error of result.errors) {
        output.print(
          `  ${JSON.stringify(error.value)}: ${error.code} — ${JSON.stringify(error.message)}\n`
        );
      }
      printRecovery();
    } else {
      const set = result.labels.filter(
        item => item.operation === 'upsert'
      ).length;
      const removed = result.labels.filter(
        item => item.operation === 'delete'
      ).length;
      output.success(
        `Value labels updated for ${kind}.${attributeKey}: ${set} set, ${removed} removed`
      );
    }
    return failed ? 1 : 0;
  } catch (err) {
    output.stopSpinner();
    if (isAPIError(err)) {
      reason =
        err.status === 403
          ? AGENT_REASON.PERMISSION_DENIED
          : AGENT_REASON.API_ERROR;
    }
    return fail(
      err instanceof Error ? err.message : 'Failed to manage attribute labels.'
    );
  }
}

function formatLabelCell(value: string): string {
  const quoted = JSON.stringify(value);
  return value === '' || value.trim() !== value || quoted.slice(1, -1) !== value
    ? quoted
    : value;
}
