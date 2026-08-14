import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { JSONObject, JSONValue } from '@vercel-internals/types';
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
import { checksAddFlags } from './command';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';

const REQUIRES = ['build-ready', 'deployment-url', 'none'] as const;

const BLOCKING_STAGES = [
  'build-start',
  'deployment-start',
  'deployment-alias',
  'deployment-promotion',
  'none',
] as const;

function emitValidationError(
  client: Client,
  message: string,
  exitCode: number,
  extra?: { hint?: string; next?: { command: string; when?: string }[] }
): void {
  outputAgentError(
    client,
    {
      status: 'error',
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message,
      ...extra,
    },
    exitCode
  );
}

export async function checksAdd(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification([...checksAddFlags]);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message: error instanceof Error ? error.message : String(error),
        },
        1
      );
    }
    printError(error);
    return 1;
  }

  if (parsedArgs.args.length > 1) {
    emitValidationError(
      client,
      'Invalid number of arguments. Usage: `vercel project checks add [name]`',
      2
    );
    output.error(
      'Invalid number of arguments. Usage: `vercel project checks add [name]`'
    );
    return 2;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    if (client.nonInteractive) {
      emitValidationError(client, formatResult.error, 1);
    }
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput || Boolean(client.nonInteractive);

  const filePath = parsedArgs.flags['--file'];
  const checkName = parsedArgs.flags['--check-name'];
  const requires = parsedArgs.flags['--requires'];
  const blocksFlag = parsedArgs.flags['--blocks'];
  const timeout = parsedArgs.flags['--timeout'];
  const targetsRaw = parsedArgs.flags['--targets'];
  const sourceRaw = parsedArgs.flags['--source'];

  let body: JSONObject;

  if (typeof filePath === 'string' && filePath.length > 0) {
    try {
      const raw = readFileSync(resolve(client.cwd, filePath), 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        emitValidationError(client, '`--file` must contain a JSON object.', 1);
        output.error('`--file` must contain a JSON object.');
        return 1;
      }
      body = parsed as JSONObject;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      emitValidationError(client, `Failed to read \`--file\`: ${msg}`, 1);
      output.error(`Failed to read \`--file\`: ${msg}`);
      return 1;
    }
  } else {
    if (typeof checkName !== 'string' || !checkName.trim()) {
      emitValidationError(
        client,
        'Provide `--check-name` and `--requires`, or a `--file` with the full JSON body.',
        1,
        {
          hint: 'See `vercel project checks --help` and the REST API "Create a check" documentation.',
          next: [
            {
              command: buildCommandWithGlobalFlags(
                client.argv,
                'project checks add <name> --file <path>'
              ),
              when: 'Create from a JSON file (replace paths)',
            },
          ],
        }
      );
      output.error(
        'Provide `--check-name` and `--requires`, or a `--file` with the full JSON body. See `vercel project checks add --help`.'
      );
      return 1;
    }
    if (typeof requires !== 'string' || !requires.trim()) {
      emitValidationError(
        client,
        '`--requires` is required when using `--check-name` (build-ready, deployment-url, or none).',
        1
      );
      output.error(
        '`--requires` is required when using `--check-name` (build-ready, deployment-url, or none).'
      );
      return 1;
    }
    if (!REQUIRES.includes(requires as (typeof REQUIRES)[number])) {
      emitValidationError(
        client,
        `\`--requires\` must be one of: ${REQUIRES.join(', ')}`,
        1
      );
      output.error(`\`--requires\` must be one of: ${REQUIRES.join(', ')}`);
      return 1;
    }
    body = {
      name: checkName.trim(),
      requires: requires.trim(),
    };
    if (typeof blocksFlag === 'string' && blocksFlag.length > 0) {
      if (
        !BLOCKING_STAGES.includes(
          blocksFlag as (typeof BLOCKING_STAGES)[number]
        )
      ) {
        emitValidationError(
          client,
          `\`--blocks\` must be one of: ${BLOCKING_STAGES.join(', ')}`,
          1
        );
        output.error(
          `\`--blocks\` must be one of: ${BLOCKING_STAGES.join(', ')}`
        );
        return 1;
      }
      body.blocks = blocksFlag;
    }
    if (typeof timeout === 'number') {
      body.timeout = timeout;
    }
    if (typeof targetsRaw === 'string' && targetsRaw.trim()) {
      body.targets = targetsRaw
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    }
    if (typeof sourceRaw === 'string' && sourceRaw.trim()) {
      try {
        body.source = JSON.parse(sourceRaw) as JSONValue;
      } catch {
        emitValidationError(client, '`--source` must be valid JSON.', 1);
        output.error('`--source` must be valid JSON.');
        return 1;
      }
    }
  }

  try {
    const project = await getProjectByCwdOrLink({
      client,
      commandName: 'project checks add',
      projectNameOrId: parsedArgs.args[0],
      forReadOnlyCommand: true,
    });

    const result = await client.fetch<JSONObject>(
      `/v2/projects/${encodeURIComponent(project.id)}/checks`,
      {
        method: 'POST',
        body,
      }
    );

    if (asJson) {
      const id = String(result.id ?? '');
      if (client.nonInteractive) {
        client.stdout.write(
          `${JSON.stringify(
            {
              status: AGENT_STATUS.OK,
              check: result,
              projectId: project.id,
              projectName: project.name,
              message: id
                ? `Created deployment check ${id} on ${project.name}.`
                : `Created deployment check on ${project.name}.`,
              next: [
                {
                  command: buildCommandWithGlobalFlags(
                    client.argv,
                    'project checks'
                  ),
                  when: 'List checks for this project',
                },
                {
                  command: buildCommandWithGlobalFlags(
                    client.argv,
                    'project checks remove <check_id>'
                  ),
                  when: 'Remove a check by id if needed',
                },
              ],
            },
            null,
            2
          )}\n`
        );
      } else {
        client.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      }
      return 0;
    }

    const id = String(result.id ?? '');
    output.log(
      id
        ? `Created deployment check ${id} on ${project.name}.`
        : `Created deployment check on ${project.name}.`
    );
    return 0;
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, { variant: 'checks' });
    printError(err);
    return 1;
  }
}
