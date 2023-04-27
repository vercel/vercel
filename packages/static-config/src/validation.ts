import Ajv from 'ajv';
import { FromSchema, JSONSchema } from 'json-schema-to-ts';

const ajv = new Ajv();

export function validate<T extends JSONSchema>(
  schema: T,
  data: any
): FromSchema<T> {
  const isValid = ajv.compile(schema);
  if (!isValid(data)) {
    // TODO: better error message
    throw new Error('Invalid data');
  }
  // @ts-expect-error - this seems to work just fine, but TS complains it could be infinite nesting
  return data as FromSchema<T>;
}
