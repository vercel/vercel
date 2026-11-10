import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { outputError } from '../../util/command-validation';
import fetch from '../../util/fetch';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import { formatProject } from '../../util/projects/format-project';
import ua from '../../util/ua';
import output from '../../output-manager';
import { quoteArg } from '../../util/flags/quote-arg';
import { readStdinText } from '../../util/input/read-standard-input';
import { SDK_KEY_PATTERN } from '../../util/redact-args';
import {
  buildCommandWithGlobalFlags,
  shouldEmitNonInteractiveCommandError,
  writeActionRequired,
} from '../../util/agent-output';
import {
  AGENT_REASON,
  AGENT_STATUS,
  getExitCodeForReason,
} from '../../util/agent-output-constants';
import {
  isPackedDatafile,
  printDatafileSummary,
} from '../../util/flags/print-datafile-summary';
import { FlagsDatafileTelemetryClient } from '../../util/telemetry/commands/flags/datafile';
import { datafileSubcommand } from './command';
import { getLinkedFlagsProject, getProjectNameFromFlags } from './project';

export const DATAFILE_URL = 'https://flags.vercel.com/v1/datafile';

const ENVIRONMENTS = ['production', 'preview', 'development'];

const MAX_SDK_KEY_BYTES = 4096;

/**
 * The whole key must be printable ASCII without spaces. Line breaks or control
 * characters would make `fetch` reject the header with an error that repeats it.
 */
const SDK_KEY_FORMAT = /^vf_(?:server|client)_[\x21-\x7E]+$/;

/** Command names in JSON errors stay plain so they carry no ANSI codes. */
function commandName(json: boolean, subcommands: string): string {
  return json ? getCommandNamePlain(subcommands) : getCommandName(subcommands);
}

function sdkKeyInputHint(json: boolean): string {
  return `Pipe it to stdin instead, for example ${commandName(json, 'flags datafile --sdk-key < sdk-key.txt')}.`;
}

export default async function datafile(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsDatafileTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(datafileSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 2;
  }

  const { args, flags } = parsedArgs;
  const projectName = getProjectNameFromFlags(flags);
  const environment = flags['--environment'] as string | undefined;
  const useSdkKey = Boolean(flags['--sdk-key']);
  const json = Boolean(flags['--json']);

  telemetryClient.trackCliOptionProject(projectName);
  telemetryClient.trackCliOptionEnvironment(environment);
  telemetryClient.trackCliFlagSdkKey(useSdkKey);
  telemetryClient.trackCliFlagJson(json);

  // `--sdk-key` takes no value, so a key passed inline is either attached to
  // it (and dropped by the parser) or left as an argument. Never echo it.
  if (
    argv.some(arg => arg.startsWith('--sdk-key=')) ||
    args.some(arg => SDK_KEY_PATTERN.test(arg))
  ) {
    return outputError(
      client,
      json,
      'INVALID_ARGUMENTS',
      `SDK keys can't be passed as arguments. ${sdkKeyInputHint(json)}`
    );
  }
  if (args.length > 0) {
    return outputError(
      client,
      json,
      'INVALID_ARGUMENTS',
      `${commandName(json, 'flags datafile')} doesn't take arguments.`
    );
  }

  if (environment !== undefined && !ENVIRONMENTS.includes(environment)) {
    return outputError(
      client,
      json,
      'INVALID_ARGUMENTS',
      `Invalid environment "${environment}". Must be one of: ${ENVIRONMENTS.join(', ')}.`
    );
  }

  if (useSdkKey) {
    if (environment) {
      return outputError(
        client,
        json,
        'MUTUAL_EXCLUSIVITY',
        'The --environment option cannot be used with --sdk-key, as SDK keys are already bound to an environment.'
      );
    }
    if (projectName) {
      return outputError(
        client,
        json,
        'MUTUAL_EXCLUSIVITY',
        'The --project option cannot be used with --sdk-key, as SDK keys are already bound to a project.'
      );
    }

    const sdkKey = await readSdkKey(client, json);
    if (typeof sdkKey === 'number') {
      return sdkKey;
    }

    if (!json) {
      output.spinner('Fetching datafile');
    }
    return fetchAndPrintDatafile(client, json, sdkKey, {}, 'Bearer', {
      jsonCommand: getJsonCommand(['--sdk-key']),
    });
  }

  const link = await getLinkedFlagsProject(client, projectName);
  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    return outputError(
      client,
      json,
      'NOT_LINKED',
      `Your codebase isn't linked to a project on Vercel. Pass --project <name>, or run ${commandName(json, 'link')} to link it.`
    );
  }

  const { project, org } = link;

  if (!json) {
    output.spinner(
      `Fetching ${environment ? `${environment} ` : ''}datafile for ${formatProject(org.slug, project.name)}`
    );
  }

  let token: string;
  let authScheme: 'Bearer' | 'VercelUser' = 'Bearer';
  const targetEnvironment = environment ?? 'development';
  const headers: Record<string, string> = {
    'x-vercel-flags-project-id': project.id,
  };
  try {
    const oidcToken =
      targetEnvironment === 'development'
        ? await getDevelopmentOidcToken(client, project.id, org.id)
        : undefined;
    if (oidcToken) {
      token = oidcToken;
    } else {
      await client.ensureAuthorized();
      if (!client.authConfig.token) {
        output.stopSpinner();
        return outputError(
          client,
          json,
          'NOT_AUTHORIZED',
          `No user token is available. Run ${commandName(json, 'login')} and retry the datafile command.`
        );
      }
      token = client.authConfig.token;
      authScheme = 'VercelUser';
      headers['x-vercel-flags-team-id'] = org.id;
      headers['x-vercel-env'] = targetEnvironment;
    }
  } catch (err) {
    output.stopSpinner();
    return printUnexpectedError(client, json, err);
  }

  return fetchAndPrintDatafile(client, json, token, headers, authScheme, {
    projectLabel: formatProject(org.slug, project.name),
    environment: targetEnvironment,
    jsonCommand: getJsonCommand([
      ...(projectName ? ['--project', quoteArg(projectName)] : []),
      ...(environment ? ['--environment', environment] : []),
    ]),
  });
}

function getJsonCommand(args: string[]): string {
  return getCommandName(['flags datafile', ...args, '--json'].join(' '));
}

/**
 * Reads the SDK key from stdin, or from a masked prompt in an interactive
 * terminal, so it never appears in argv or shell history. Returns an exit
 * code when no valid key was provided.
 */
async function readSdkKey(
  client: Client,
  json: boolean
): Promise<string | number> {
  let sdkKey: string;
  if (!client.stdin.isTTY) {
    sdkKey = (await readStdinText(client.stdin, MAX_SDK_KEY_BYTES)).trim();
  } else if (!client.nonInteractive && !json) {
    sdkKey = (
      await client.input.password({
        message: 'SDK key',
        mask: true,
        validate: value =>
          value.trim().length > 0 ? true : 'Enter an SDK key.',
      })
    ).trim();
  } else {
    return missingSdkKey(client, json, 'Missing SDK key.');
  }

  if (!sdkKey) {
    return missingSdkKey(client, json, 'No SDK key was read from stdin.');
  }
  if (!SDK_KEY_PATTERN.test(sdkKey)) {
    return outputError(
      client,
      json,
      'INVALID_ARGUMENTS',
      'The SDK key must start with vf_server_ or vf_client_.'
    );
  }
  if (!SDK_KEY_FORMAT.test(sdkKey)) {
    return outputError(
      client,
      json,
      'INVALID_ARGUMENTS',
      "The SDK key can't contain spaces, line breaks, or other control characters."
    );
  }
  return sdkKey;
}

/**
 * The command succeeds once the caller pipes the key, so this is
 * `action_required` rather than an error.
 */
function missingSdkKey(client: Client, json: boolean, problem: string): number {
  const reason = AGENT_REASON.MISSING_KEY;
  const machine = json || shouldEmitNonInteractiveCommandError(client);
  const message = `${problem} ${sdkKeyInputHint(machine)}`;
  if (machine) {
    writeActionRequired(client, {
      status: AGENT_STATUS.ACTION_REQUIRED,
      reason,
      message,
      next: [
        {
          command: `${buildCommandWithGlobalFlags(
            client.argv,
            `flags datafile --sdk-key${json ? ' --json' : ''}`
          )} < <SDK_KEY_FILE>`,
          when: 'Replace <SDK_KEY_FILE> with a file that contains the SDK key',
        },
      ],
    });
  } else {
    output.error(message);
  }
  return getExitCodeForReason(reason);
}

/**
 * Passes the project's account explicitly instead of setting
 * `client.config.currentTeam`, which a token refresh would write to the
 * user's global config.
 */
async function getDevelopmentOidcToken(
  client: Client,
  projectId: string,
  accountId: string
): Promise<string | undefined> {
  try {
    const result = await client.fetch<{ token?: string }>(
      `/projects/${projectId}/token`,
      {
        method: 'POST',
        accountId,
        retry: { retries: 0 },
        bailOn429: true,
        body: JSON.stringify({ source: 'vercel-cli' }),
        headers: { 'Content-Type': 'application/json' },
      }
    );
    return typeof result.token === 'string' && result.token.trim()
      ? result.token
      : undefined;
  } catch {
    output.debug(
      'Development OIDC token unavailable; using user authentication.'
    );
    return undefined;
  }
}

async function fetchAndPrintDatafile(
  client: Client,
  json: boolean,
  token: string,
  extraHeaders: Record<string, string>,
  authScheme: 'Bearer' | 'VercelUser',
  summary: {
    projectLabel?: string;
    environment?: string;
    jsonCommand: string;
  }
): Promise<number> {
  try {
    const res = await fetch(DATAFILE_URL, {
      redirect: 'error',
      headers: {
        accept: 'application/json',
        authorization: `${authScheme} ${token}`,
        'user-agent': ua,
        ...extraHeaders,
      },
    });
    output.stopSpinner();

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return outputError(
        client,
        json,
        'DATAFILE_FETCH_FAILED',
        redactSecret(
          `Failed to fetch datafile (${res.status} ${res.statusText})${body ? `: ${body}` : ''}`,
          token
        )
      );
    }

    const data: unknown = await res.json();
    if (json) {
      client.stdout.write(`${JSON.stringify({ datafile: data }, null, 2)}\n`);
    } else if (isPackedDatafile(data)) {
      printDatafileSummary(data, summary);
    } else {
      // Unknown format: show it as-is rather than an empty summary.
      client.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    }
    return 0;
  } catch (err) {
    output.stopSpinner();
    return printUnexpectedError(client, json, err, token);
  }
}

/** Replaces every occurrence of a credential so errors never repeat it. */
function redactSecret(text: string, secret: string): string {
  return secret ? text.split(secret).join('[REDACTED]') : text;
}

function printUnexpectedError(
  client: Client,
  json: boolean,
  err: unknown,
  secret = ''
): number {
  const message = err instanceof Error ? err.message : String(err);
  const redacted = redactSecret(message, secret);
  if (json) {
    return outputError(client, json, 'UNEXPECTED_ERROR', redacted);
  }
  // A new error drops the original stack, which would repeat the message.
  printError(redacted === message ? err : new Error(redacted));
  return 1;
}
