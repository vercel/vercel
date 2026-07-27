import type Client from '../../util/client';
import output from '../../output-manager';
import stamp from '../../util/output/stamp';
import { getCommandName, packageName } from '../../util/pkg-name';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { validateJsonOutput } from '../../util/output-format';
import {
  buildCommandWithGlobalFlags,
  openUrlInBrowserCommand,
  shouldEmitNonInteractiveCommandError,
} from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { verifySubcommand } from './command';
import { DomainsVerifyTelemetryClient } from '../../util/telemetry/commands/domains/verify';
import {
  acquireVerificationFacts,
  type VerificationAcquisitionError,
} from './verify-acquisition';
import {
  diagnoseDomain,
  type DomainDiagnosisCommands,
} from './verify-diagnosis';
import {
  renderHumanOutput,
  type HumanVerificationOutput,
} from './verify-human-output';
import {
  renderStructuredError,
  renderStructuredOutput,
  type StructuredVerificationError,
} from './verify-structured-output';

type VerificationOutputMode = 'human' | 'json' | 'non-interactive';

interface VerifyOptions {
  domainName: string;
  project: string | undefined;
  strict: boolean;
  outputMode: VerificationOutputMode;
}

export default async function verify(client: Client, argv: string[]) {
  const telemetry = new DomainsVerifyTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });
  const flagsSpecification = getFlagsSpecification(verifySubcommand.options);

  let parsedArgs;
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    return writeCommandError(client, getOutputMode(client, false), {
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      code: 'invalid_arguments',
      message: errorMessage(error),
      next: [
        {
          command: buildCommandWithGlobalFlags(
            client.argv,
            'domains verify --help'
          ),
          when: 'See valid arguments and flags',
        },
      ],
    });
  }

  const { args, flags } = parsedArgs;
  const [domainName] = args;
  if (!domainName || args.length !== 1) {
    return writeCommandError(client, getOutputMode(client, false), {
      reason: AGENT_REASON.MISSING_ARGUMENTS,
      code: 'missing_arguments',
      message: 'A single domain is required.',
      next: [
        {
          command: buildCommandWithGlobalFlags(
            client.argv,
            'domains verify <domain>'
          ),
          when: 'Replace <domain> with the domain to check',
        },
      ],
      humanMessage: `${getCommandName(
        'domains verify <domain>'
      )} expects one argument`,
    });
  }

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    return writeCommandError(client, getOutputMode(client, false), {
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      code: 'invalid_arguments',
      message: formatResult.error,
      next: [
        {
          command: buildCommandWithGlobalFlags(
            client.argv,
            `domains verify ${shellQuoteCommandArg(domainName)} --format=json`
          ),
          when: 'Retry with the supported JSON format',
        },
      ],
    });
  }

  telemetry.trackCliArgumentDomain(domainName);
  telemetry.trackCliOptionProject(flags['--project']);
  telemetry.trackCliFlagStrict(flags['--strict']);
  telemetry.trackCliOptionFormat(flags['--format']);

  const options: VerifyOptions = {
    domainName,
    project: flags['--project'],
    strict: Boolean(flags['--strict']),
    outputMode: getOutputMode(client, formatResult.jsonOutput),
  };

  try {
    return await run(client, options);
  } catch (error) {
    output.stopSpinner();
    if (isStructuredOutput(options.outputMode)) {
      return writeCommandError(client, options.outputMode, {
        reason: AGENT_REASON.API_ERROR,
        code: 'api_error',
        message: errorMessage(error),
        next: [
          {
            command: buildVerifyCommand(client, options),
            when: 'Retry the domain check',
          },
        ],
      });
    }
    output.prettyError(error);
    return 1;
  }
}

async function run(client: Client, options: VerifyOptions): Promise<number> {
  const elapsed = stamp();
  if (options.outputMode === 'human') {
    output.spinner(`Checking DNS configuration for ${options.domainName}`);
  }

  const acquisition = await acquireVerificationFacts(client, options);
  output.stopSpinner();

  if (!acquisition.ok) {
    return writeCommandError(
      client,
      options.outputMode,
      commandErrorForAcquisition(client, options, acquisition.error)
    );
  }

  const diagnosis = diagnoseDomain(
    acquisition.facts,
    buildDiagnosisCommands(client, options)
  );
  if (isStructuredOutput(options.outputMode)) {
    client.stdout.write(renderStructuredOutput(diagnosis));
  } else {
    writeHumanOutput(renderHumanOutput(diagnosis, elapsed()));
  }
  return diagnosis.exitCode;
}

function getOutputMode(
  client: Client,
  jsonOutput: boolean
): VerificationOutputMode {
  if (jsonOutput) {
    return 'json';
  }
  return shouldEmitNonInteractiveCommandError(client)
    ? 'non-interactive'
    : 'human';
}

function isStructuredOutput(mode: VerificationOutputMode): boolean {
  return mode !== 'human';
}

function buildDiagnosisCommands(
  client: Client,
  options: VerifyOptions
): DomainDiagnosisCommands {
  return {
    teamsList: buildTeamsListCommand(client),
    verify: scopeOverride => buildVerifyCommand(client, options, scopeOverride),
    attachProject: projectIdOrName => {
      const projectArgument =
        projectIdOrName === '<project>'
          ? projectIdOrName
          : shellQuoteCommandArg(projectIdOrName);
      return buildCommandWithGlobalFlags(
        client.argv,
        `domains add ${shellQuoteCommandArg(
          options.domainName
        )} ${projectArgument}`
      );
    },
    openUrl: openUrlInBrowserCommand,
  };
}

function commandErrorForAcquisition(
  client: Client,
  options: VerifyOptions,
  error: VerificationAcquisitionError
): CommandError {
  const next =
    error.kind === 'permission-denied'
      ? [
          {
            command: buildTeamsListCommand(client),
            when: 'List teams to find the scope that owns the project',
          },
          {
            command: buildVerifyCommand(client, options, '<team>'),
            when: 'Replace <team> with the owning team and retry',
          },
        ]
      : [
          {
            command:
              error.kind === 'invalid-domain'
                ? buildCommandWithGlobalFlags(
                    client.argv,
                    'domains verify <domain>'
                  )
                : buildVerifyCommand(client, options),
            when:
              error.kind === 'invalid-domain'
                ? 'Replace <domain> with a valid domain name'
                : 'Retry the domain check',
          },
        ];

  return {
    reason: reasonForAcquisitionError(error),
    code: error.code,
    message: error.message,
    next,
  };
}

function reasonForAcquisitionError(
  error: VerificationAcquisitionError
): string {
  if (error.kind === 'invalid-domain') {
    return AGENT_REASON.INVALID_DOMAIN;
  } else if (error.kind === 'permission-denied') {
    return AGENT_REASON.PERMISSION_DENIED;
  } else if (error.kind === 'timeout') {
    return 'timeout';
  } else if (error.kind === 'unexpected-dns-response') {
    return 'unexpected_dns_response';
  } else {
    return AGENT_REASON.API_ERROR;
  }
}

function buildVerifyCommand(
  client: Client,
  options: VerifyOptions,
  scopeOverride?: string
): string {
  const parts = ['domains', 'verify', shellQuoteCommandArg(options.domainName)];
  if (options.project) {
    parts.push('--project', shellQuoteCommandArg(options.project));
  }
  if (options.strict) {
    parts.push('--strict');
  }
  if (options.outputMode === 'json') {
    parts.push('--format=json');
  }
  if (scopeOverride) {
    parts.push('--scope', scopeOverride);
  }
  return buildCommandWithGlobalFlags(
    client.argv,
    parts.join(' '),
    packageName,
    scopeOverride
      ? { excludeFlags: ['--scope', '--team', '-S', '-T'] }
      : undefined
  );
}

function buildTeamsListCommand(client: Client): string {
  return buildCommandWithGlobalFlags(client.argv, 'teams ls', packageName, {
    excludeFlags: ['--scope', '--team', '-S', '-T'],
  });
}

function shellQuoteCommandArg(value: string): string {
  if (/^[a-zA-Z0-9_./:@%+,=-]+$/.test(value)) {
    return value;
  }
  return `"${value.replace(/(["\\$`])/g, '\\$1')}"`;
}

interface CommandError extends StructuredVerificationError {
  humanMessage?: string;
}

function writeCommandError(
  client: Client,
  outputMode: VerificationOutputMode,
  error: CommandError
): number {
  output.stopSpinner();
  if (isStructuredOutput(outputMode)) {
    client.stdout.write(renderStructuredError(error));
  } else {
    output.error(error.humanMessage ?? error.message);
  }
  return 1;
}

function writeHumanOutput(result: HumanVerificationOutput): void {
  if (result.lead.kind === 'success') {
    output.success(result.lead.message);
  } else {
    output.log(result.lead.message);
  }
  for (const section of result.sections) {
    output.print(section);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
