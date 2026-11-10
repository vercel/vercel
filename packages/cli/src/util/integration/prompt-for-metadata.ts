import type Client from '../client';
import { CHECKBOX_INSTRUCTIONS } from '../input/checkbox-instructions';
import { remoteText } from '../output/remote-text';
import { getVisibleOptions } from './format-schema-help';
import { parseMetadataFlags } from './parse-metadata';
import type { Metadata, MetadataSchema } from './types';

/**
 * Prompts for each metadata key and parses the answers with the same rules as
 * `--meta KEY=VALUE`. Every key must be defined in `schema`.
 */
export async function promptForMetadata(
  client: Client,
  keys: string[],
  schema: MetadataSchema
): Promise<Metadata> {
  const answers: string[] = [];
  for (const key of keys) {
    const prop = schema.properties[key];
    const label = remoteText(prop['ui:label'] ?? key);
    const options = getVisibleOptions(prop);
    const choices = options?.map(option => ({ name: option, value: option }));
    let answer: string;
    if (choices && prop.type === 'array') {
      const picked = await client.input.checkbox<string>({
        message: `${label}?${CHECKBOX_INSTRUCTIONS}`,
        instructions: false,
        choices,
        required: true,
      });
      answer = picked.join(',');
    } else if (choices) {
      answer = await client.input.select({
        message: `${label}?`,
        choices,
      });
    } else if (prop.type === 'boolean') {
      answer = String(await client.input.confirm(`${label}?`, false));
    } else {
      answer = await client.input.text({
        message: `${label}?`,
        validate: value =>
          (value.trim() !== '' &&
            parseMetadataFlags([`${key}=${value}`], schema).errors.length ===
              0) ||
          `Enter a valid ${label}.`,
      });
    }
    answers.push(`${key}=${answer}`);
  }
  return parseMetadataFlags(answers, schema).metadata;
}
