import Ajv from 'ajv';
import { FromSchema, JSONSchema } from 'json-schema-to-ts';

const ajv = new Ajv();

export function validate<T extends JSONSchema>(
  schema: T,
  data: any
): FromSchema<T> {
  const isValid = ajv.compile(schema);
  if (!isValid(data)) {
    const details = ajv.errorsText(isValid.errors, { dataVar: 'config' });
    throw new Error(`Invalid data: ${details}`);
  }
  // @ts-expect-error - this seems to work just fine, but TS complains it could be infinite nesting
  return data as FromSchema<T>;
}
