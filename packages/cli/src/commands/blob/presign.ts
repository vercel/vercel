import * as blob from '@vercel/blob';
import output from '../../output-manager';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { parseAccessFlag } from '../../util/blob/access';
import { blobOpts, type BlobRWToken } from '../../util/blob/token';
import { resolveBlobValidUntil } from '../../util/blob/validity';
import { BlobPresignTelemetryClient } from '../../util/telemetry/commands/blob';
import { presignSubcommand } from './command';

const VALID_OPERATIONS = ['get', 'head', 'put', 'delete'] as const;
type PresignOperation = (typeof VALID_OPERATIONS)[number];

function isPresignOperation(value: string): value is PresignOperation {
  return (VALID_OPERATIONS as readonly string[]).includes(value);
}

function parseOperation(
  operation: string | undefined
): PresignOperation | null {
  const operationValue = operation ?? 'get';
  if (!isPresignOperation(operationValue)) {
    output.error(
      `Invalid operation value: '${operationValue}'. Must be one of: get, head, put, delete.`
    );
    return null;
  }
  return operationValue;
}

function hasUploadOnlyFlags(options: {
  allowedContentTypes: string[] | undefined;
  maximumSizeInBytes: number | undefined;
  allowOverwrite: boolean | undefined;
  addRandomSuffix: boolean | undefined;
  cacheControlMaxAge: number | undefined;
}) {
  const {
    allowedContentTypes,
    maximumSizeInBytes,
    allowOverwrite,
    addRandomSuffix,
    cacheControlMaxAge,
  } = options;
  return Boolean(
    (allowedContentTypes && allowedContentTypes.length > 0) ||
      maximumSizeInBytes !== undefined ||
      allowOverwrite ||
      addRandomSuffix ||
      cacheControlMaxAge !== undefined
  );
}

function writePresignOutput(params: {
  client: Client;
  asJson: boolean | undefined;
  operation: PresignOperation;
  presignedUrl: string;
  validUntil?: number;
}) {
  const { client, asJson, operation, presignedUrl, validUntil } = params;
  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(
        {
          operation,
          presignedUrl,
          ...(validUntil !== undefined ? { validUntil } : {}),
        },
        null,
        2
      )}\n`
    );
  } else {
    client.stdout.write(`${presignedUrl}\n`);
  }
}

export default async function presign(
  client: Client,
  argv: string[],
  auth: BlobRWToken
): Promise<number> {
  const telemetryClient = new BlobPresignTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(presignSubcommand.options);
  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const {
    flags,
    args: [pathname],
  } = parsedArgs;
  const {
    '--access': accessFlag,
    '--operation': operationFlag,
    '--delegation-token': delegationTokenFlag,
    '--client-signing-token': clientSigningTokenFlag,
    '--valid-until': validUntil,
    '--valid-for': validFor,
    '--if-match': ifMatch,
    '--allow-overwrite': allowOverwrite,
    '--add-random-suffix': addRandomSuffix,
    '--cache-control-max-age': cacheControlMaxAge,
    '--allowed-content-type': allowedContentTypes,
    '--maximum-size-in-bytes': maximumSizeInBytes,
    '--json': asJson,
  } = flags;

  if (!pathname) {
    output.error('Missing required argument: pathname');
    return 1;
  }

  const access = parseAccessFlag(accessFlag);
  if (!access) {
    return 1;
  }

  const operation = parseOperation(operationFlag);
  if (!operation) {
    return 1;
  }

  const validity = resolveBlobValidUntil({ validUntil, validFor });
  if (validity.error) {
    output.error(validity.error);
    return 1;
  }

  if (Boolean(delegationTokenFlag) !== Boolean(clientSigningTokenFlag)) {
    output.error(
      'The --delegation-token and --client-signing-token flags must be passed together. Pass both, or pass neither to issue a token automatically.'
    );
    return 1;
  }

  if (
    operation !== 'put' &&
    hasUploadOnlyFlags({
      allowedContentTypes,
      maximumSizeInBytes,
      allowOverwrite,
      addRandomSuffix,
      cacheControlMaxAge,
    })
  ) {
    output.error(
      'The flags --allowed-content-type, --maximum-size-in-bytes, --allow-overwrite, --add-random-suffix, and --cache-control-max-age can only be used with --operation put.'
    );
    return 1;
  }

  if (operation === 'get' || operation === 'head') {
    if (ifMatch) {
      output.error(
        'The --if-match flag can only be used with --operation put or --operation delete.'
      );
      return 1;
    }
  }

  telemetryClient.trackCliArgumentPathname(pathname);
  telemetryClient.trackCliOptionAccess(accessFlag);
  telemetryClient.trackCliOptionOperation(operationFlag);
  telemetryClient.trackCliOptionDelegationToken(delegationTokenFlag);
  telemetryClient.trackCliOptionClientSigningToken(clientSigningTokenFlag);
  telemetryClient.trackCliOptionValidUntil(validUntil);
  telemetryClient.trackCliOptionValidFor(validFor);
  telemetryClient.trackCliOptionIfMatch(ifMatch);
  telemetryClient.trackCliFlagAllowOverwrite(allowOverwrite);
  telemetryClient.trackCliFlagAddRandomSuffix(addRandomSuffix);
  telemetryClient.trackCliOptionCacheControlMaxAge(cacheControlMaxAge);
  telemetryClient.trackCliOptionAllowedContentType(allowedContentTypes);
  telemetryClient.trackCliOptionMaximumSizeInBytes(maximumSizeInBytes);
  telemetryClient.trackCliFlagJson(asJson);

  try {
    output.debug('Generating presigned URL');
    output.spinner('Generating presigned URL');

    const signedToken =
      delegationTokenFlag && clientSigningTokenFlag
        ? {
            delegationToken: delegationTokenFlag,
            clientSigningToken: clientSigningTokenFlag,
          }
        : await blob.issueSignedToken({
            ...blobOpts(auth),
            pathname,
            operations: [operation],
            validUntil: validity.validUntil,
            ...(operation === 'put'
              ? {
                  allowedContentTypes,
                  maximumSizeInBytes,
                }
              : {}),
          });

    const presigned = await blob.presignUrl(
      {
        delegationToken: signedToken.delegationToken,
        clientSigningToken: signedToken.clientSigningToken,
      },
      {
        operation,
        pathname,
        access,
        validUntil: validity.validUntil,
        ...(operation === 'put'
          ? {
              allowedContentTypes,
              maximumSizeInBytes,
              allowOverwrite,
              addRandomSuffix,
              cacheControlMaxAge,
              ifMatch,
            }
          : operation === 'delete'
            ? { ifMatch }
            : {}),
      }
    );

    output.stopSpinner();

    writePresignOutput({
      client,
      asJson,
      operation,
      presignedUrl: presigned.presignedUrl,
      validUntil:
        'validUntil' in signedToken ? signedToken.validUntil : undefined,
    });
    return 0;
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }
}
