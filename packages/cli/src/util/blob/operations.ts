import output from '../../output-manager';

export const BLOB_OPERATIONS = ['get', 'head', 'put', 'delete'] as const;
export type BlobOperation = (typeof BLOB_OPERATIONS)[number];

export const UPLOAD_CONSTRAINT_FLAGS_ERROR =
  'The flags --allowed-content-type and --maximum-size-in-bytes can only be used with --operation put.';

export const PRESIGN_UPLOAD_ONLY_FLAGS_ERROR =
  'The flags --allowed-content-type, --maximum-size-in-bytes, --allow-overwrite, --add-random-suffix, and --cache-control-max-age can only be used with --operation put.';

export function isBlobOperation(value: string): value is BlobOperation {
  return (BLOB_OPERATIONS as readonly string[]).includes(value);
}

export function parseBlobOperation(
  operation: string | undefined,
  defaultOperation: BlobOperation = 'get'
): BlobOperation | null {
  const operationValue = operation ?? defaultOperation;
  if (!isBlobOperation(operationValue)) {
    output.error(
      `Invalid operation value: '${operationValue}'. Must be one of: get, head, put, delete.`
    );
    return null;
  }
  return operationValue;
}

export function parseBlobOperations(
  operations: string[] | undefined
): BlobOperation[] | undefined | null {
  if (!operations || operations.length === 0) {
    return undefined;
  }

  const invalidOperation = operations.find(operation => {
    return !isBlobOperation(operation);
  });

  if (invalidOperation) {
    output.error(
      `Invalid operation value: '${invalidOperation}'. Must be one of: get, head, put, delete.`
    );
    return null;
  }

  return operations as BlobOperation[];
}

export function allowsUploadConstraints(
  operations: BlobOperation[] | undefined
): boolean {
  return operations === undefined || operations.includes('put');
}

export function hasUploadConstraintFlags(options: {
  allowedContentTypes: string[] | undefined;
  maximumSizeInBytes: number | undefined;
}): boolean {
  const { allowedContentTypes, maximumSizeInBytes } = options;
  return Boolean(
    (allowedContentTypes && allowedContentTypes.length > 0) ||
      maximumSizeInBytes !== undefined
  );
}

export function hasPresignUploadOnlyFlags(options: {
  allowedContentTypes: string[] | undefined;
  maximumSizeInBytes: number | undefined;
  allowOverwrite: boolean | undefined;
  addRandomSuffix: boolean | undefined;
  cacheControlMaxAge: number | undefined;
}): boolean {
  return (
    hasUploadConstraintFlags(options) ||
    Boolean(
      options.allowOverwrite ||
        options.addRandomSuffix ||
        options.cacheControlMaxAge !== undefined
    )
  );
}
