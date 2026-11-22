import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatDynamicExamples } from '../../../../src/util/integration/format-dynamic-examples';
import { addSubcommand } from '../../../../src/commands/integration/command';
import { formatMetadataSchemaHelp } from '../../../../src/util/integration/format-schema-help';
import { createHelpTheme } from '../../../../src/util/output/help-theme';
import type { IntegrationProduct } from '../../../../src/util/integration/types';

// Strip ANSI codes so we can match plain text
function stripAnsi(str: string): string {
  return str.replace(/\u001b\[[0-9;]*m/g, '');
}

// Product with a metadataSchema so the metadata example is generated
const productWithSchema: IntegrationProduct[] = [
  {
    id: 'iap_test',
    slug: 'test-product',
    name: 'Test Product',
    shortDescription: 'A test product',
    type: 'storage',
    metadataSchema: {
      type: 'object',
      properties: {
        region: {
          type: 'string',
          'ui:control': 'vercel-region',
          'ui:options': ['iad1', 'sfo1'],
        },
      },
      required: ['region'],
    },
  },
];

describe('formatDynamicExamples', () => {
  afterEach(() => vi.unstubAllEnvs());
  it.each([
    'two words;echo SAMPLE',
    '$(echo SAMPLE)',
    '`echo SAMPLE`',
    'value";echo SAMPLE',
    'value\nSAMPLE',
    'value*',
  ])('uses neutral placeholders for unsafe provider values: %s', value => {
    vi.stubEnv('NO_COLOR', '');
    vi.stubEnv('TERM', 'xterm');
    vi.stubEnv('FORCE_COLOR', '1');
    const schema = {
      type: 'object' as const,
      properties: {
        region: {
          type: 'string' as const,
          'ui:control': 'select',
          'ui:options': [value],
        },
        zones: {
          type: 'array' as const,
          'ui:control': 'select',
          'ui:options': [value, 'iad1'],
        },
      },
    };
    const products = [{ ...productWithSchema[0], metadataSchema: schema }];
    const theme = createHelpTheme(
      { isTTY: true },
      { level: 1, noColor: false }
    );
    const rendered = formatDynamicExamples(
      'sample',
      products,
      'integration add',
      120,
      theme
    );
    expect(rendered).toContain('\u001b[36m');
    const command = rendered.split('\n').find(line => line.includes('--meta'))!;
    expect(command).toBe(
      '    vercel integration add sample --meta region=<VALUE> --meta "zones=<VALUE>"'
    );
    expect(command).not.toContain('\u001b[');
    const schemaHelp = stripAnsi(formatMetadataSchemaHelp(schema, 'sample'));
    expect(schemaHelp).toContain('Example: --meta region=<VALUE>');
    expect(schemaHelp).toContain('Example: --meta "zones=<VALUE>"');
  });

  it('keeps unsafe provider keys and selectors out of suggested commands', () => {
    const products = [
      {
        ...productWithSchema[0],
        slug: 'product;echo SAMPLE',
        metadataSchema: {
          type: 'object' as const,
          properties: {
            'key;echo SAMPLE': {
              type: 'boolean' as const,
              'ui:control': 'input',
            },
          },
        },
      },
      productWithSchema[0],
    ];
    const output = stripAnsi(
      formatDynamicExamples('integration;echo SAMPLE', products)
    );
    const commands = output
      .split('\n')
      .filter(line => line.startsWith('    vercel '));
    expect(commands.length).toBeGreaterThan(0);
    for (const command of commands) expect(command).not.toMatch(/SAMPLE|[;$`]/);
    expect(commands).toContain(
      '    vercel integration add <INTEGRATION>/<PRODUCT> --meta <KEY>=true'
    );
    const schemaHelp = stripAnsi(
      formatMetadataSchemaHelp(products[0].metadataSchema, 'sample')
    );
    expect(schemaHelp).toContain('Example: --meta <KEY>=true');
  });

  it('does not invent a provider billing plan', () => {
    const output = stripAnsi(
      formatDynamicExamples('sample', productWithSchema)
    );
    expect(output).toContain(
      'vercel integration add sample --billing-plan <PLAN>'
    );
    expect(output).not.toContain('--billing-plan pro');
    expect(output).toContain('--meta region=iad1');
  });

  it('should include an example for every addSubcommand option', () => {
    const output = stripAnsi(
      formatDynamicExamples('test-integration', productWithSchema)
    );

    for (const option of addSubcommand.options) {
      if (!('description' in option) || option.deprecated) {
        continue;
      }

      const longFlag = `--${option.name}`;
      const shortFlag = option.shorthand ? `-${option.shorthand}` : null;
      const hasLong = output.includes(longFlag);
      const hasShort = shortFlag ? output.includes(shortFlag) : false;

      expect(
        hasLong || hasShort,
        `Dynamic examples missing flag "${longFlag}"${shortFlag ? ` / "${shortFlag}"` : ''}. ` +
          `Add an example to formatDynamicExamples() for this option.`
      ).toBe(true);
      // A hidden short form is an old spelling; examples teach the long name.
      if ('deprecatedShorthand' in option) {
        expect(output).not.toMatch(
          new RegExp(`\\s-${option.deprecatedShorthand}\\s`)
        );
      }
    }

    expect(output).not.toContain('--format');
    // Hidden old names, like `--metadata`, stay out of the examples.
    for (const option of addSubcommand.options) {
      if (option.deprecated) {
        expect(output).not.toMatch(new RegExp(`--${option.name}(\\s|=|$)`));
      }
    }
  });

  it('should use custom commandName in examples', () => {
    const output = stripAnsi(
      formatDynamicExamples('test-integration', productWithSchema, 'install')
    );

    expect(output).toContain('vercel install test-integration');
    expect(output).not.toContain('integration add');
  });
});
