import type Client from '../client';
import {
  getVisibleOptions,
  isHiddenOnCreate,
  isServerHandledRegion,
} from './format-schema-help';
import type { Metadata, MetadataSchema, MetadataSchemaProperty } from './types';

/**
 * Build `{ name, value }` choices from a field's visible `ui:options`,
 * preserving option labels when present.
 */
function getOptionChoices(
  prop: MetadataSchemaProperty
): { name: string; value: string }[] | undefined {
  const raw = prop['ui:options'];
  if (!raw) return undefined;
  const choices: { name: string; value: string }[] = [];
  for (const opt of raw) {
    if (typeof opt === 'string') {
      if (opt) choices.push({ name: opt, value: opt });
    } else if (!opt.hidden && opt.value) {
      choices.push({ name: opt.label ?? opt.value, value: opt.value });
    }
  }
  return choices.length > 0 ? choices : undefined;
}

function fieldLabel(key: string, prop: MetadataSchemaProperty): string {
  return prop['ui:label'] || prop.description || key;
}

function isSelectLike(prop: MetadataSchemaProperty): boolean {
  const control = prop['ui:control'];
  return (
    control === 'select' ||
    control === 'radio-button' ||
    isServerHandledRegion(prop)
  );
}

/**
 * Interactively prompt for the given metadata fields using the product's
 * metadata schema. Used when the server can't resolve required fields (e.g. an
 * AWS `vercel-region`) and returns a `metadata` step — so the CLI can collect
 * them in-terminal and retry, instead of falling back to the browser.
 *
 * Only call this when `client.stdin.isTTY` is true. Fields already present in
 * `existing` (provided via flags) or hidden on create are skipped. Returns the
 * collected values (may be empty if there was nothing to prompt for).
 */
export async function promptForMetadataFields(
  client: Client,
  schema: MetadataSchema,
  fieldKeys: string[],
  existing: Metadata
): Promise<Metadata> {
  const collected: Metadata = {};

  for (const key of fieldKeys) {
    const prop = schema.properties[key];
    if (!prop || isHiddenOnCreate(prop)) {
      continue;
    }
    if (existing[key] !== undefined) {
      continue;
    }

    const message = fieldLabel(key, prop);
    const choices = getOptionChoices(prop);

    // Select / region / enum-style fields
    if (choices && (isSelectLike(prop) || prop.type === 'string')) {
      collected[key] = await client.input.select<string>({ message, choices });
      continue;
    }

    // Multi-value fields
    if (prop.type === 'array') {
      if (choices) {
        const selected = await client.input.checkbox<string>({
          message,
          choices,
        });
        collected[key] = selected;
      } else {
        const raw = await client.input.text({
          message: `${message} (comma-separated)`,
        });
        collected[key] = raw
          .split(',')
          .map(v => v.trim())
          .filter(v => v.length > 0);
      }
      continue;
    }

    // Boolean / toggle
    if (prop.type === 'boolean' || prop['ui:control'] === 'toggle') {
      collected[key] = await client.input.confirm(
        message,
        prop.default === true
      );
      continue;
    }

    // Number
    if (prop.type === 'number') {
      const raw = await client.input.text({
        message,
        validate: (value: string) => {
          const num = Number(value);
          if (value.trim() === '' || Number.isNaN(num) || !Number.isFinite(num))
            return 'Enter a valid number';
          if (prop.minimum !== undefined && num < prop.minimum)
            return `Must be >= ${prop.minimum}`;
          if (prop.maximum !== undefined && num > prop.maximum)
            return `Must be <= ${prop.maximum}`;
          return true;
        },
      });
      collected[key] = Number(raw);
      continue;
    }

    // Free-form string (with enum validation if options exist)
    collected[key] = await client.input.text({
      message,
      validate: (value: string) =>
        value.trim().length > 0 ? true : `${message} is required`,
    });
  }

  return collected;
}

/**
 * The required fields the CLI should prompt for when an auto-provision
 * `metadata` step comes back. Prefers the server-provided `fields` (which
 * already excludes anything it resolved on its own); otherwise falls back to
 * required fields in the schema that aren't yet satisfied. Hidden-on-create
 * fields are never prompted for (they use server-side defaults).
 */
export function resolvePromptableFields(
  schema: MetadataSchema,
  existing: Metadata,
  serverFields?: { key: string }[]
): string[] {
  const candidateKeys = serverFields?.length
    ? serverFields.map(f => f.key)
    : (schema.required ?? []);

  return candidateKeys.filter(key => {
    const prop = schema.properties[key];
    if (!prop || isHiddenOnCreate(prop)) return false;
    if (existing[key] !== undefined) return false;
    // Only prompt for fields we can actually render a prompt for.
    const hasOptions = Boolean(getVisibleOptions(prop));
    return (
      hasOptions ||
      prop.type === 'string' ||
      prop.type === 'number' ||
      prop.type === 'boolean' ||
      prop.type === 'array'
    );
  });
}
