import chalk from 'chalk';
import { readFileSync } from 'fs';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import {
  buildCommandWithGlobalFlags,
  exitWithNonInteractiveError,
  outputAgentError,
} from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import { trustedSourcesSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import { ProjectTelemetryClient } from '../../util/telemetry/commands/project';
import type { JSONObject, Project } from '@vercel-internals/types';

const ACTIONS = ['get', 'set', 'disable'] as const;
type Action = (typeof ACTIONS)[number];

interface SettingSpec {
  /** Project PATCH body field, verbatim from the public schema. */
  field: 'trustedSources';
  /** CLI segment, e.g. `trusted-sources`. */
  slug: string;
  /** Human label used in output. */
  label: string;
  commandName: string;
  subcommand: typeof trustedSourcesSubcommand;
  /**
   * Build the PATCH value for `set` from parsed flags. Returns an error
   * message when local validation fails (nothing is sent remotely).
   */
  buildSetValue(
    flags: Record<string, unknown>
  ): { ok: true; value: unknown } | { ok: false; message: string };
  /** Value used to turn the setting off. */
  disableValue: unknown;
}

function fail(message: string): { ok: false; message: string } {
  return { ok: false, message };
}

/**
 * Local structural validation for `--file` JSON passed to trusted-sources
 * set. Deep semantic validation (env slugs, claims, limits) is enforced by
 * the API; here we ensure the payload is an object limited to the public
 * schema's top-level keys so malformed input never reaches the wire.
 */
function parseTrustedSourcesFile(
  filePath: string
): { ok: true; value: unknown } | { ok: false; message: string } {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (err) {
    return fail(
      `Could not read --file: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fail('Invalid --file: expected a JSON object.');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return fail(
      'Invalid --file: expected a JSON object with `projects` and/or `oidcProviders` keys.'
    );
  }
  const keys = Object.keys(parsed as Record<string, unknown>);
  const allowed = ['projects', 'oidcProviders'];
  const unknown = keys.filter(k => !allowed.includes(k));
  if (unknown.length > 0) {
    return fail(
      `Invalid --file: unknown key(s) ${unknown.join(', ')}. Allowed keys: ${allowed.join(', ')}.`
    );
  }
  if (keys.length === 0) {
    return fail(
      'Invalid --file: provide at least one of `projects` or `oidcProviders`.'
    );
  }
  return { ok: true, value: parsed };
}

const TRUSTED_SOURCES: SettingSpec = {
  field: 'trustedSources',
  slug: 'trusted-sources',
  label: 'Trusted Sources',
  commandName: 'project protection trusted-sources',
  subcommand: trustedSourcesSubcommand,
  buildSetValue(flags) {
    const file = flags['--file'] as string | undefined;
    if (!file) {
      return fail(
        '`--file <path>` with the Trusted Sources JSON config is required for set.'
      );
    }
    return parseTrustedSourcesFile(file);
  },
  disableValue: null,
};

const SPECS: Record<string, SettingSpec> = {
  'trusted-sources': TRUSTED_SOURCES,
};

export function getProtectionSettingSpec(slug: string): SettingSpec | null {
  return SPECS[slug] ?? null;
}

export async function projectProtectionSetting(
  client: Client,
  spec: SettingSpec,
  argv: string[]
): Promise<number> {
  const telemetry = new ProjectTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(spec.subcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    outputAgentError(
      client,
      {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: error instanceof Error ? error.message : String(error),
      },
      1
    );
    printError(error);
    return 1;
  }

  const actionArg = parsedArgs.args[0];
  const action = (ACTIONS as readonly string[]).includes(actionArg ?? '')
    ? (actionArg as Action)
    : undefined;

  if (!action || parsedArgs.args.length > 2) {
    const msg = `Invalid arguments. Usage: \`vercel ${spec.commandName} get|set|disable [name]\``;
    outputAgentError(
      client,
      {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: msg,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              `${spec.commandName} get`
            ),
            when: `Show the current ${spec.label} configuration`,
          },
        ],
      },
      2
    );
    output.error(msg);
    return 2;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    outputAgentError(
      client,
      {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: formatResult.error,
      },
      1
    );
    output.error(formatResult.error);
    return 1;
  }
  const preferJson = formatResult.jsonOutput || Boolean(client.nonInteractive);

  const skipConfirmation = Boolean(parsedArgs.flags['--yes']);
  telemetry.trackCliArgumentAction(action);
  telemetry.trackCliOptionFile(parsedArgs.flags['--file'] as string);
  telemetry.trackCliFlagYes(skipConfirmation);

  // Local validation before any remote call.
  let setValue: unknown;
  if (action === 'set') {
    const built = spec.buildSetValue(parsedArgs.flags);
    if (!built.ok) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message: built.message,
        },
        1
      );
      output.error(built.message);
      return 1;
    }
    setValue = built.value;
  }

  if (action === 'disable' && !skipConfirmation) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.CONFIRMATION_REQUIRED,
          message: `Confirm disabling ${spec.label} by adding --yes.`,
          next: [
            {
              command: buildCommandWithGlobalFlags(
                client.argv,
                `${spec.commandName} disable ${parsedArgs.args[1] ?? ''}`.trim() +
                  ' --yes'
              ),
              when: `confirm and disable ${spec.label}`,
            },
          ],
        },
        1
      );
      return 1;
    }
    if (!client.stdin.isTTY) {
      output.error(
        'Missing required flag --yes. Use --yes to skip the confirmation prompt in non-interactive mode.'
      );
      return 1;
    }
  }

  let project: Project;
  try {
    project = await getProjectByCwdOrLink({
      client,
      commandName: spec.commandName,
      projectNameOrId: parsedArgs.args[1],
      forReadOnlyCommand: action === 'get',
    });
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, { variant: 'protection' });
    printError(err);
    return 1;
  }

  if (action === 'get') {
    const raw = project as Project & Record<string, unknown>;
    const current = spec.field in raw ? raw[spec.field] : null;
    if (preferJson) {
      client.stdout.write(
        `${JSON.stringify(
          {
            projectId: project.id,
            name: project.name,
            [spec.field]: current ?? null,
          },
          null,
          2
        )}\n`
      );
      return 0;
    }
    output.log(
      `${chalk.bold(spec.label)} for ${chalk.cyan(project.name)} (${project.id})`
    );
    if (current === null || current === undefined) {
      output.log(`${spec.label} is not configured for this project.`);
      return 0;
    }
    output.log(JSON.stringify(current, null, 2));
    return 0;
  }

  if (action === 'disable' && !skipConfirmation) {
    const confirmed = await client.input.confirm(
      `Disable ${spec.label} for ${chalk.bold(project.name)}?`,
      false
    );
    if (!confirmed) {
      output.log('Aborted');
      return 0;
    }
  }

  const patchValue = action === 'set' ? setValue : spec.disableValue;
  try {
    await client.fetch(`/v9/projects/${encodeURIComponent(project.id)}`, {
      method: 'PATCH',
      body: { [spec.field]: patchValue } as unknown as JSONObject,
    });
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, { variant: 'protection' });
    printError(err);
    return 1;
  }

  if (preferJson) {
    client.stdout.write(
      `${JSON.stringify(
        {
          action,
          projectId: project.id,
          projectName: project.name,
          [spec.field]: patchValue,
        },
        null,
        2
      )}\n`
    );
    return 0;
  }
  output.log(
    `${chalk.bold(spec.label)} ${action === 'set' ? 'updated' : 'disabled'} for ${chalk.cyan(project.name)}`
  );
  return 0;
}
