import * as blob from '@vercel/blob';
import output from '../../output-manager';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { blobOpts, type BlobRWToken } from '../../util/blob/token';
import { resolveBlobValidUntil } from '../../util/blob/validity';
import { BlobSignedTokenTelemetryClient } from '../../util/telemetry/commands/blob';
import { signedTokenSubcommand } from './command';

const VALID_OPERATIONS = ['get', 'head', 'put', 'delete'] as const;
type DelegationOperation = (typeof VALID_OPERATIONS)[number];

function isDelegationOperation(value: string): value is DelegationOperation {
  return (VALID_OPERATIONS as readonly string[]).includes(value);
}

function parseOperations(
  operations: string[] | undefined
): DelegationOperation[] | undefined | null {
  if (!operations || operations.length === 0) {
    return undefined;
  }

  const invalidOperation = operations.find(operation => {
    return !isDelegationOperation(operation);
  });

  if (invalidOperation) {
    output.error(
      `Invalid operation value: '${invalidOperation}'. Must be one of: get, head, put, delete.`
    );
    return null;
  }

  return operations as DelegationOperation[];
}

function formatSignedToken(result: blob.IssuedSignedToken): string {
  return `delegationToken=${result.delegationToken}
clientSigningToken=${result.clientSigningToken}
validUntil=${result.validUntil} (${new Date(result.validUntil).toISOString()})
`;
}

export default async function signedToken(
  client: Client,
  argv: string[],
  auth: BlobRWToken
): Promise<number> {
  const telemetryClient = new BlobSignedTokenTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(
    signedTokenSubcommand.options
  );
  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { flags } = parsedArgs;
  const {
    '--pathname': pathname,
    '--operation': operationValues,
    '--valid-until': validUntil,
    '--valid-for': validFor,
    '--allowed-content-type': allowedContentTypes,
    '--maximum-size-in-bytes': maximumSizeInBytes,
    '--json': asJson,
  } = flags;

  const operations = parseOperations(operationValues);
  if (operations === null) {
    return 1;
  }

  const validity = resolveBlobValidUntil({ validUntil, validFor });
  if (validity.error) {
    output.error(validity.error);
    return 1;
  }

  telemetryClient.trackCliOptionPathname(pathname);
  telemetryClient.trackCliOptionOperation(operationValues);
  telemetryClient.trackCliOptionValidUntil(validUntil);
  telemetryClient.trackCliOptionValidFor(validFor);
  telemetryClient.trackCliOptionAllowedContentType(allowedContentTypes);
  telemetryClient.trackCliOptionMaximumSizeInBytes(maximumSizeInBytes);
  telemetryClient.trackCliFlagJson(asJson);

  try {
    output.debug('Issuing signed token');
    output.spinner('Issuing signed token');

    const result = await blob.issueSignedToken({
      ...blobOpts(auth),
      pathname,
      operations,
      validUntil: validity.validUntil,
      allowedContentTypes,
      maximumSizeInBytes,
    });

    output.stopSpinner();

    if (asJson) {
      client.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      client.stdout.write(formatSignedToken(result));
    }
    return 0;
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }
}
