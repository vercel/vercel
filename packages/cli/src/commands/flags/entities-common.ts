import type arg from 'arg';
import type { CommandOption } from '../help';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { FlagsEntitiesTelemetryClient } from '../../util/telemetry/commands/flags/entities';
import chalk from 'chalk';
import type Client from '../../util/client';
import { getCommandName } from '../../util/pkg-name';
import cmd from '../../util/output/cmd';
import { quoteArg } from '../../util/flags/quote-arg';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
  type AgentErrorPayload,
} from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import {
  hasEntityUsage,
  type EntityUsage,
} from '../../util/flags/entity-usage';
import type { FlagSettingsEntity } from '../../util/flags/types';
import output from '../../output-manager';
import { formatProject } from '../../util/projects/format-project';
import type { ProjectLinked } from '@vercel-internals/types';
import { getLinkedFlagsProject } from './project';

export type EntitiesProjectContext = Pick<ProjectLinked, 'project' | 'org'> & {
  projectSlugLink: string;
};

export async function resolveEntitiesProject(
  client: Client,
  projectName: string | undefined
): Promise<EntitiesProjectContext | { exitCode: number }> {
  const link = await getLinkedFlagsProject(client, projectName);
  if (link.status === 'error') {
    return { exitCode: link.exitCode };
  } else if (link.status === 'not_linked') {
    if (client.nonInteractive) {
      entityAgentError(client, {
        reason: AGENT_REASON.NOT_LINKED,
        message: 'Your codebase is not linked to a project. Run link first.',
        next: [
          {
            command: 'link',
            when: 'link the project',
          },
        ],
      });
      return { exitCode: 1 };
    }
    output.fatal(
      `Your codebase isn't linked to a project on Vercel. Pass --project <name>, or run ${getCommandName('link')} to link it.`
    );
    return { exitCode: 1 };
  }

  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  return {
    project: link.project,
    org: link.org,
    projectSlugLink: formatProject(link.org.slug, link.project.name),
  };
}

export function isExitCodeResult(
  result: EntitiesProjectContext | { exitCode: number }
): result is { exitCode: number } {
  return 'exitCode' in result;
}

export function formatAttributeList(entity: FlagSettingsEntity): string {
  if (entity.attributes.length === 0) {
    return chalk.dim('-');
  }
  return entity.attributes
    .map(attribute => `${attribute.key}:${chalk.dim(attribute.type)}`)
    .join(', ');
}

export function printEntityDetails(
  entity: FlagSettingsEntity,
  projectSlugLink: string
) {
  output.log(
    `\nFeature flag entity ${chalk.bold(entity.kind)} for ${projectSlugLink}\n`
  );
  output.print(`  ${chalk.dim('Kind:')}        ${entity.kind}\n`);
  output.print(`  ${chalk.dim('Label:')}       ${entity.label}\n`);
  output.print(`  ${chalk.dim('Attributes:')}\n`);
  if (entity.attributes.length === 0) {
    output.print(`    ${chalk.dim('-')}\n`);
  }
  for (const attribute of entity.attributes) {
    output.print(`    ${attribute.key}  ${chalk.dim(attribute.type)}\n`);
  }
  output.print('\n');
}

export function reportEntityNotFound(
  client: Client,
  kind: string,
  retryCommand: string
): void {
  entityAgentError(client, {
    reason: AGENT_REASON.NOT_FOUND,
    message: `Entity ${kind} was not found in this project.`,
    next: [
      {
        command: 'flags entities ls',
        when: 'list entities to find the kind',
      },
      {
        command: retryCommand,
        when: 'replace <kind> with an existing entity kind and retry',
      },
    ],
  });
  output.fatal(
    `Entity ${chalk.bold(kind)} was not found. Run ${cmd(buildCommandWithGlobalFlags(client.argv, 'flags entities ls', undefined, { preserveProject: true, excludeFlags: ['--yes'] }))} to list entities.`
  );
}

/**
 * Prints the in-use error for an entity or attribute. Returns `true` when the
 * caller must stop because references still exist.
 */
export function reportEntityInUse(
  client: Client,
  options: {
    kind: string;
    attribute?: string;
    usage: EntityUsage;
    retryCommand: string;
  }
): boolean {
  const { kind, attribute, usage, retryCommand } = options;
  if (!hasEntityUsage(usage)) {
    return false;
  }

  const subject = attribute
    ? `Attribute ${kind}.${attribute}`
    : `Entity ${kind}`;
  const lines = [`${subject} is still in use and can't be changed.`];
  if (usage.flags.length > 0) {
    lines.push(`Used by feature flags: ${usage.flags.join(', ')}`);
  }
  if (usage.segments.length > 0) {
    lines.push(`Used by segments: ${usage.segments.join(', ')}`);
  }

  const inspectCommand =
    usage.flags.length > 0
      ? `flags inspect ${quoteArg(usage.flags[0])}`
      : `flags segments inspect ${quoteArg(usage.segments[0])}`;

  entityAgentError(client, {
    reason: AGENT_REASON.ENTITY_IN_USE,
    message: lines.join('\n'),
    next: [
      {
        command: inspectCommand,
        when: 'inspect one reference that still uses it',
      },
      {
        command: retryCommand,
        when: 'retry after removing all references',
      },
    ],
  });

  lines.push(
    '',
    `Run ${cmd(buildCommandWithGlobalFlags(client.argv, inspectCommand, undefined, { preserveProject: true, excludeFlags: ['--yes'] }))} to inspect one reference, remove all references to ${attribute ? 'the attribute' : 'the entity'}, then try again.`
  );
  output.fatal(lines.join('\n'));
  return true;
}

export async function selectEntityKind(
  client: Client,
  entities: FlagSettingsEntity[],
  action: 'update' | 'delete',
  retryCommand: string
): Promise<string | undefined> {
  if (client.nonInteractive) {
    entityAgentError(client, {
      reason: AGENT_REASON.MISSING_ARGUMENTS,
      message:
        'Provide an entity kind. Run `vercel flags entities ls` to list entities.',
      next: [
        {
          command: retryCommand,
          when: `replace <kind> with the entity kind to ${action}`,
        },
        {
          command: 'flags entities ls',
          when: 'list entities to find the kind',
        },
      ],
    });
    return undefined;
  }
  if (!client.stdin.isTTY) {
    output.fatal(`Provide an entity kind to ${action}`);
    output.log(
      `Example: ${getCommandName(action === 'delete' ? 'flags entities delete device' : 'flags entities update user --add-attribute email:string')}`
    );
    return undefined;
  }
  if (entities.length === 0) {
    output.log('No feature flag entities found');
    return undefined;
  }

  return client.input.select({
    message: `Select an entity to ${action}:`,
    choices: entities.map(entity => ({
      name: `${entity.label} (${entity.kind})`,
      value: entity.kind,
    })),
  });
}

export function parseEntityArguments(
  client: Client,
  argv: string[],
  options: readonly CommandOption[]
) {
  const parsed = parseArguments(
    argv,
    getFlagsSpecification(options) as arg.Spec
  );
  new FlagsEntitiesTelemetryClient({
    opts: { store: client.telemetryEventStore },
  }).trackArguments(parsed.args, parsed.flags);
  return parsed;
}

/** Apply project/global context to every entity recovery command in one place. */
export function entityAgentError(
  client: Client,
  payload: Omit<AgentErrorPayload, 'status'>
): void {
  outputAgentError(
    client,
    {
      ...payload,
      status: AGENT_STATUS.ERROR,
      next: payload.next?.map(next => ({
        ...next,
        command: buildCommandWithGlobalFlags(
          client.argv,
          next.command,
          undefined,
          {
            preserveProject: next.command.startsWith('flags '),
            excludeFlags: ['--yes'],
          }
        ),
      })),
    },
    1
  );
}
