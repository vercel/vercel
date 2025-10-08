import type Client from '../../util/client';
import list, { type ListChoice } from '../../util/input/list';
import type {
  Expression,
  Metadata,
  MetadataEntry,
  MetadataSchema,
  MetadataSchemaProperty,
} from '../../util/integration/types';

// This is a set of all the UI controls that the metadata wizard supports.
// For all options see https://vercel.com/docs/integrations/marketplace-product#metadata-schema
const supportedUIControls = new Set([
  'input',
  'select',
  'region',
  'vercel-region',
]);

type Step = (client: Client) => Promise<MetadataEntry>;

function createHiddenStep(key: string, schema: MetadataSchemaProperty) {
  if (schema['ui:hidden'] !== true && schema['ui:hidden'] !== 'create') {
    throw new Error(
      `HiddenStep: Expected "ui:hidden" to have value 'true' or '"create"' for key "${key}", but was "${schema['ui:hidden']}"`
    );
  }

  return async () => {
    const value = schema.default;
    return [key, value] as const;
  };
}

function createInputStep(key: string, schema: MetadataSchemaProperty) {
  if (schema['ui:control'] !== 'input') {
    throw new Error(
      `InputStep: Expected control "input" for key "${key}", but was "${schema['ui:control']}"`
    );
  }

  switch (schema.type) {
    case 'string': {
      return async (client: Client) => {
        const value = await client.input.text({
          message: schema['ui:placeholder'] || schema['ui:label'] || key,
          default: schema.default,
        });
        return [key, value] as const;
      };
    }
    case 'number': {
      return async (client: Client) => {
        const value = await client.input.text({
          message: schema['ui:placeholder'] || schema['ui:label'] || key,
          default: schema.default,
          validate: value => {
            const number = Number(value);

            if (Number.isNaN(number)) {
              return `Value "${value}" must be a number.`;
            }

            if (schema.minimum !== undefined && schema.minimum > number) {
              return `Value "${value}" must be greater or equal ${schema.minimum}.`;
            }

            if (schema.maximum !== undefined && schema.maximum < number) {
              return `Value "${value}" must be smaller or equal ${schema.maximum}.`;
            }

            return true;
          },
        });
        return [key, value] as const;
      };
    }
    default: {
      throw new Error(
        `[Input Step] Unsupported schema type for input control of key "${key}": ${schema.type}`
      );
    }
  }
}

function createSelectStep(key: string, schema: MetadataSchemaProperty) {
  if (!['select', 'region', 'vercel-region'].includes(schema['ui:control'])) {
    throw new Error(
      `SelectStep: Expected control "select", "region" or "vercel-region", but was "${schema['ui:control']}"`
    );
  }

  if (!schema['ui:options']?.length) {
    throw new Error(
      `SelectStep: Expected control for key "${key}" to have options, but was ${JSON.stringify(schema['ui:options'])}`
    );
  }

  const options = schema['ui:options'];
  const choices: ListChoice[] = [];

  const defaultValue = schema.default;
  for (const option of options) {
    if (typeof option === 'string') {
      choices.push({
        name: option,
        value: option,
        short: option,
        selected: Boolean(defaultValue && option === defaultValue),
      });
    } else {
      if (option.hidden) {
        continue;
      }

      choices.push({
        name: option.label,
        value: option.value,
        short: option.label,
        selected: Boolean(defaultValue && option.value === defaultValue),
      });
    }
  }

  return async (client: Client) => {
    const value = await list(client, {
      message: schema['ui:placeholder'] || schema['ui:label'] || key,
      choices,
    });

    return [key, value] as const;
  };
}

export interface MetadataWizard {
  isSupported: boolean;
  run: (client: Client) => Promise<Metadata>;
}

export function createMetadataWizard(
  metadataSchema: MetadataSchema
): MetadataWizard {
  const properties = metadataSchema.properties;

  let isSupported = true;
  let allFieldsAreReadonly = true;

  const steps: Step[] = [];

  for (const [key, schema] of Object.entries(properties)) {
    try {
      if (isHidden(schema)) {
        steps.push(createHiddenStep(key, schema));
        continue;
      }

      if (isDisabled(schema)) {
        continue;
      }

      if (!supportedUIControls.has(schema['ui:control'])) {
        isSupported = false;
        break;
      }

      if (!isReadOnly(schema)) {
        allFieldsAreReadonly = false;
      }
    } catch (error) {
      if (error instanceof ExpressionError) {
        isSupported = false;
        break;
      }
      throw error;
    }

    switch (schema['ui:control']) {
      case 'input': {
        steps.push(createInputStep(key, schema));
        break;
      }
      case 'region':
      case 'vercel-region':
      case 'select': {
        steps.push(createSelectStep(key, schema));
        break;
      }
      default: {
        throw new Error(
          `Unsupported metadata control: ${schema['ui:control']}`
        );
      }
    }
  }

  return {
    isSupported,
    run: async (client: Client) =>
      allFieldsAreReadonly
        ? getMetadataFromReadOnlyFields(metadataSchema)
        : getMetadataFromSteps(client, steps),
  };
}

function getMetadataFromReadOnlyFields(metadataSchema: MetadataSchema) {
  const metadata: Record<string, string | number | undefined> = {};

  for (const [key, schema] of Object.entries(metadataSchema.properties)) {
    if (isHidden(schema)) {
      continue;
    }

    if (!isReadOnly(schema)) {
      throw new Error(`Field "${key}" must be read-only.`);
    }

    metadata[key] = schema.default;
  }

  return metadata;
}

async function getMetadataFromSteps(
  client: Client,
  steps: Step[]
): Promise<Metadata> {
  const metadataEntries: MetadataEntry[] = [];

  for (const step of steps) {
    metadataEntries.push(await step(client));
  }

  return Object.fromEntries(metadataEntries);
}

function isHidden(schema: MetadataSchemaProperty) {
  if (instanceOfExpression(schema['ui:hidden'])) {
    throw new ExpressionError('Expression found in schema');
  }
  return Boolean(
    schema['ui:hidden'] === true || schema['ui:hidden'] === 'create'
  );
}

function isReadOnly(schema: MetadataSchemaProperty) {
  if (instanceOfExpression(schema['ui:read-only'])) {
    throw new ExpressionError('Expression found in schema');
  }
  return Boolean(
    schema['ui:read-only'] === true || schema['ui:read-only'] === 'create'
  );
}

function isDisabled(schema: MetadataSchemaProperty) {
  if (instanceOfExpression(schema['ui:disabled'])) {
    throw new ExpressionError('Expression found in schema');
  }
  return Boolean(
    schema['ui:disabled'] === true || schema['ui:disabled'] === 'create'
  );
}

function instanceOfExpression(obj: unknown): obj is Expression {
  const checkedAsObject = Object(obj);
  if (obj !== checkedAsObject) {
    return false;
  }
  return 'expr' in checkedAsObject;
}

class ExpressionError extends Error {}
