import type { Transform, TransformOp, TransformType } from './types';

/**
 * Parses key=value format strings into transforms.
 *
 * @param values Array of "key=value" strings
 * @param type The transform type
 * @param op The operation (set, append, delete)
 * @returns Array of Transform objects
 */
export function parseTransforms(
  values: string[],
  type: TransformType,
  op: TransformOp
): Transform[] {
  return values.map(value => parseTransform(value, type, op));
}

/**
 * Parses a single key=value string into a Transform object.
 */
function parseTransform(
  input: string,
  type: TransformType,
  op: TransformOp
): Transform {
  if (op === 'delete') {
    // For delete, the input is just the key
    const key = input.trim();
    if (!key) {
      throw new Error('Delete operation requires a key');
    }
    return {
      type,
      op,
      target: { key },
    };
  }

  // For set/append, parse key=value
  const eqIndex = input.indexOf('=');
  if (eqIndex === -1) {
    throw new Error(`Invalid format: "${input}". Expected format: key=value`);
  }

  const key = input.slice(0, eqIndex).trim();
  const args = input.slice(eqIndex + 1);

  if (!key) {
    throw new Error('Transform key cannot be empty');
  }

  return {
    type,
    op,
    target: { key },
    args,
  };
}

/**
 * Collects all transforms from CLI flags into a single array.
 */
export interface TransformFlags {
  setResponseHeader?: string[];
  appendResponseHeader?: string[];
  deleteResponseHeader?: string[];
  setRequestHeader?: string[];
  appendRequestHeader?: string[];
  deleteRequestHeader?: string[];
  setRequestQuery?: string[];
  appendRequestQuery?: string[];
  deleteRequestQuery?: string[];
}

export function collectTransforms(flags: TransformFlags): Transform[] {
  const transforms: Transform[] = [];

  // Response headers
  if (flags.setResponseHeader) {
    transforms.push(
      ...parseTransforms(flags.setResponseHeader, 'response.headers', 'set')
    );
  }
  if (flags.appendResponseHeader) {
    transforms.push(
      ...parseTransforms(
        flags.appendResponseHeader,
        'response.headers',
        'append'
      )
    );
  }
  if (flags.deleteResponseHeader) {
    transforms.push(
      ...parseTransforms(
        flags.deleteResponseHeader,
        'response.headers',
        'delete'
      )
    );
  }

  // Request headers
  if (flags.setRequestHeader) {
    transforms.push(
      ...parseTransforms(flags.setRequestHeader, 'request.headers', 'set')
    );
  }
  if (flags.appendRequestHeader) {
    transforms.push(
      ...parseTransforms(flags.appendRequestHeader, 'request.headers', 'append')
    );
  }
  if (flags.deleteRequestHeader) {
    transforms.push(
      ...parseTransforms(flags.deleteRequestHeader, 'request.headers', 'delete')
    );
  }

  // Request query
  if (flags.setRequestQuery) {
    transforms.push(
      ...parseTransforms(flags.setRequestQuery, 'request.query', 'set')
    );
  }
  if (flags.appendRequestQuery) {
    transforms.push(
      ...parseTransforms(flags.appendRequestQuery, 'request.query', 'append')
    );
  }
  if (flags.deleteRequestQuery) {
    transforms.push(
      ...parseTransforms(flags.deleteRequestQuery, 'request.query', 'delete')
    );
  }

  return transforms;
}

/**
 * Collects response headers from set transforms.
 * When op is 'set' for response.headers, we can use the headers field instead of transforms.
 * This matches frontend behavior.
 */
export function collectResponseHeaders(
  setHeaders: string[]
): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const input of setHeaders) {
    const eqIndex = input.indexOf('=');
    if (eqIndex === -1) {
      throw new Error(
        `Invalid header format: "${input}". Expected format: key=value`
      );
    }

    const key = input.slice(0, eqIndex).trim();
    const value = input.slice(eqIndex + 1);

    if (!key) {
      throw new Error('Header key cannot be empty');
    }

    headers[key] = value;
  }

  return headers;
}
