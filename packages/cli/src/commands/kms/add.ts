import chalk from 'chalk';
import type { JSONObject } from '@vercel-internals/types';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import output from '../../output-manager';
import { createIssuer } from '../../util/kms/issuers';
import type { CreateIssuerPayload } from '../../util/kms/issuers';
import { handleKmsApiError } from '../../util/kms/errors';
import {
  invalidArgumentCount,
  invalidInput,
  missingArgument,
} from '../../util/kms/args';
import { parseJsonObjectFlag } from '../../util/kms/parse-json-input';
import { activeSigningKey, printIssuerRows } from '../../util/kms/format';
import {
  KMS_ALGORITHMS,
  issuerJwksUrl,
  issuerUrl,
  type Issuer,
  type KmsAlgorithm,
} from '../../util/kms/types';
import { KmsAddTelemetryClient } from '../../util/telemetry/commands/kms/add';
import { addSubcommand } from './command';

const USAGE = 'kms add <name>';

export default async function add(client: Client, argv: string[]) {
  const telemetry = new KmsAddTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(addSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args, flags: opts } = parsedArgs;
  const [name] = args;

  telemetry.trackCliArgumentName(name);
  telemetry.trackCliOptionAlgorithm(opts['--algorithm']);
  telemetry.trackCliOptionClaimsSchema(opts['--claims-schema']);
  telemetry.trackCliOptionFormat(opts['--format']);

  if (!name) {
    return missingArgument(client, {
      reason: AGENT_REASON.MISSING_NAME,
      message: 'An issuer name is required.',
      usage: USAGE,
    });
  }
  if (args.length > 1) {
    return invalidArgumentCount(client, USAGE);
  }

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput || client.nonInteractive;

  const algorithm = opts['--algorithm'];
  if (algorithm && !KMS_ALGORITHMS.includes(algorithm as KmsAlgorithm)) {
    return invalidInput(
      client,
      `Invalid algorithm "${algorithm}". Supported algorithms: ${KMS_ALGORITHMS.join(', ')}.`
    );
  }

  // Read local input before the mutation so a bad file or malformed JSON never
  // leaves a half-configured issuer behind.
  let claimsSchema: JSONObject | undefined;
  if (opts['--claims-schema']) {
    try {
      claimsSchema = await parseJsonObjectFlag(
        client,
        '--claims-schema',
        opts['--claims-schema']
      );
    } catch (err) {
      return invalidInput(client, (err as Error).message);
    }
  }

  const payload: CreateIssuerPayload = {
    name,
    ...(algorithm && { algorithm: algorithm as KmsAlgorithm }),
    ...(claimsSchema && { claimsSchema }),
  };

  const { contextName } = await getScope(client);
  if (!client.nonInteractive) {
    output.spinner(`Creating issuer under ${chalk.bold(contextName)}`);
  }

  let issuer: Issuer;
  try {
    issuer = await createIssuer(client, payload);
  } catch (err: unknown) {
    output.stopSpinner();
    const handled = handleKmsApiError(client, err, {
      attempted: 'Creating an issuer',
      contextName,
    });
    if (handled !== undefined) {
      return handled;
    }
    throw err;
  }

  output.stopSpinner();

  const grantCommand = `kms add-grant ${issuer.id} --project <projectId> --environment production`;

  if (asJson) {
    const jsonOutput = client.nonInteractive
      ? {
          status: AGENT_STATUS.OK,
          issuer,
          message: `Issuer ${issuer.id} created.`,
          next: [
            {
              command: getCommandNamePlain(grantCommand),
              when: 'Let a project sign with this issuer',
            },
          ],
        }
      : issuer;
    client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
    return 0;
  }

  printIssuerRows(issuer, { label: 'Created', gutter: '✓' });
  printAlignedLabel('Issuer URL', chalk.cyan(issuerUrl(issuer.id)));
  printAlignedLabel('JWKS', chalk.cyan(issuerJwksUrl(issuer.id)));
  const active = activeSigningKey(issuer);
  if (active) {
    printAlignedLabel('Signing Key', active.keyId);
  }

  output.print('\n');
  output.log(
    `Let a project sign with this issuer: ${getCommandName(grantCommand)}`
  );

  return 0;
}
