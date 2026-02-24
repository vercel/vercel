import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatDynamicExamples } from '../../../../src/util/integration/format-dynamic-examples';
import { addSubcommand } from '../../../../src/commands/integration/command';
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
  beforeEach(() => {
    process.env.FF_AUTO_PROVISION_INSTALL = '1';
  });

  afterEach(() => {
    delete process.env.FF_AUTO_PROVISION_INSTALL;
  });

  it('should include an example for every addSubcommand option', () => {
    const output = stripAnsi(
      formatDynamicExamples('test-integration', productWithSchema)
    );

    for (const option of addSubcommand.options) {
      const longFlag = `--${option.name}`;
      const shortFlag = option.shorthand ? `-${option.shorthand}` : null;
      const hasLong = output.includes(longFlag);
      const hasShort = shortFlag ? output.includes(shortFlag) : false;

      expect(
        hasLong || hasShort,
        `Dynamic examples missing flag "${longFlag}"${shortFlag ? ` / "${shortFlag}"` : ''}. ` +
          `Add an example to formatDynamicExamples() for this option.`
      ).toBe(true);
    }
  });

  it('should use custom commandName in examples', () => {
    const output = stripAnsi(
      formatDynamicExamples('test-integration', productWithSchema, 'install')
    );

    expect(output).toContain('$ vercel install test-integration');
    expect(output).not.toContain('integration add');
  });
});
