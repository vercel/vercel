import type Client from '../client';

export type EntityLabelOperation =
  | { operation: 'upsert'; value: string; label: string }
  | { operation: 'delete'; value: string };

export type EntityLabelResult = EntityLabelOperation & {
  entityKind: string;
  attributeKey: string;
};

export interface EntityLabelsResponse {
  labels: EntityLabelResult[];
  errors: {
    entityKind: string;
    attributeKey: string;
    value: string;
    code: string;
    message: string;
  }[];
}

export function parseEntityLabelOperations(input: {
  set: string[];
  remove: string[];
  data?: string;
}): EntityLabelOperation[] {
  let operations: unknown[];
  if (input.data !== undefined) {
    if (input.set.length || input.remove.length) {
      throw new Error("Can't combine --data with --set or --remove.");
    }
    let data: unknown;
    try {
      data = JSON.parse(input.data);
    } catch {
      throw new Error('--data must be a JSON array of label operations.');
    }
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error(
        '--data must be a non-empty JSON array of label operations.'
      );
    }
    operations = data;
  } else {
    operations = [
      ...input.remove.map(value => ({ operation: 'delete' as const, value })),
      ...input.set.map(valueLabel => {
        const separator = valueLabel.indexOf('=');
        if (separator === -1) {
          throw new Error(
            'Use --set VALUE=LABEL, for example --set "pro=Pro Plan".'
          );
        }
        return {
          operation: 'upsert' as const,
          value: valueLabel.slice(0, separator),
          label: valueLabel.slice(separator + 1),
        };
      }),
    ];
  }

  return validateEntityLabelOperations(operations);
}

export const MAX_LABEL_OPERATIONS = 100;

export function validateEntityLabelOperations(
  operations: unknown[]
): EntityLabelOperation[] {
  if (operations.length > MAX_LABEL_OPERATIONS) {
    throw new Error(
      `Cannot update more than ${MAX_LABEL_OPERATIONS} labels at once. Split the operations into smaller batches.`
    );
  }
  const values = new Set<string>();
  return operations.map(item => {
    if (!item || typeof item !== 'object') {
      throw new Error('Each label operation must be an object.');
    }
    const record = item as Record<string, unknown>;
    const { operation, value, label } = record;
    if (operation !== 'upsert' && operation !== 'delete') {
      throw new Error('Label operations must use "upsert" or "delete".');
    }
    const keys =
      operation === 'upsert'
        ? ['operation', 'value', 'label']
        : ['operation', 'value'];
    if (Object.keys(record).some(key => !keys.includes(key))) {
      throw new Error(
        `Label ${operation} operations accept only ${keys.join(', ')}.`
      );
    }
    validateLabelString(value, 'value');
    if (values.has(value)) {
      throw new Error(
        'Each value can have only one label operation per command.'
      );
    }
    values.add(value);
    if (operation === 'delete') return { operation, value };
    validateLabelString(label, 'label');
    return { operation, value, label };
  });
}

export function validateLabelString(
  value: unknown,
  field: string
): asserts value is string {
  // The bulk API allows empty strings and counts code points for maxLength.
  if (typeof value !== 'string' || Array.from(value).length > 128) {
    throw new Error(
      `Label ${field} must be a string of at most 128 characters.`
    );
  }
}

export function updateEntityLabelsBulk(
  client: Client,
  projectId: string,
  items: EntityLabelResult[]
): Promise<EntityLabelsResponse> {
  return client.fetch<EntityLabelsResponse>(
    `/v1/projects/${encodeURIComponent(projectId)}/feature-flags/labels/bulk`,
    {
      method: 'PATCH',
      body: { items },
      retry: { retries: 0 },
      bailOn429: true,
    }
  );
}
