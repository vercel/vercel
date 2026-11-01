import { describe, expect, it } from 'vitest';
import {
  promptForMetadataFields,
  resolvePromptableFields,
} from '../../../../src/util/integration/prompt-for-metadata';
import type { MetadataSchema } from '../../../../src/util/integration/types';
import { client } from '../../../mocks/client';

const schema: MetadataSchema = {
  type: 'object',
  properties: {
    region: {
      type: 'string',
      'ui:control': 'vercel-region',
      'ui:label': 'Primary Region',
      'ui:options': [
        { value: 'us-east-1', label: 'East US' },
        { value: 'us-west-2', label: 'West US' },
      ],
    },
    encrypted: {
      type: 'boolean',
      'ui:control': 'toggle',
      'ui:label': 'Encrypted',
    },
    label: {
      type: 'string',
      'ui:control': 'input',
      'ui:label': 'Label',
    },
    internal: {
      type: 'string',
      'ui:control': 'input',
      'ui:hidden': 'create',
    },
  },
  required: ['region', 'encrypted', 'label', 'internal'],
};

describe('resolvePromptableFields', () => {
  it('prefers server-provided fields', () => {
    expect(resolvePromptableFields(schema, {}, [{ key: 'region' }])).toEqual([
      'region',
    ]);
  });

  it('falls back to schema.required when no server fields', () => {
    // `internal` is hidden-on-create and is filtered out.
    expect(resolvePromptableFields(schema, {})).toEqual([
      'region',
      'encrypted',
      'label',
    ]);
  });

  it('skips fields already provided', () => {
    expect(
      resolvePromptableFields(schema, { region: 'us-east-1' }, [
        { key: 'region' },
        { key: 'label' },
      ])
    ).toEqual(['label']);
  });

  it('skips hidden-on-create fields even if the server lists them', () => {
    expect(resolvePromptableFields(schema, {}, [{ key: 'internal' }])).toEqual(
      []
    );
  });
});

describe('promptForMetadataFields', () => {
  it('prompts a select for option fields, confirm for booleans, text for free-form', async () => {
    const resultPromise = promptForMetadataFields(
      client,
      schema,
      ['region', 'encrypted', 'label'],
      {}
    );

    await expect(client.stderr).toOutput('Primary Region');
    client.stdin.write('\n'); // first option: us-east-1

    await expect(client.stderr).toOutput('Encrypted');
    client.stdin.write('y\n');

    await expect(client.stderr).toOutput('Label');
    client.stdin.write('my-db\n');

    const result = await resultPromise;
    expect(result).toEqual({
      region: 'us-east-1',
      encrypted: true,
      label: 'my-db',
    });
  });

  it('skips fields already provided', async () => {
    const result = await promptForMetadataFields(client, schema, ['region'], {
      region: 'us-west-2',
    });
    expect(result).toEqual({});
  });
});
