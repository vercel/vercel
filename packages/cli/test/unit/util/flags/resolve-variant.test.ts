import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import { describe, expect, it } from 'vitest';
import {
  resolveVariant,
  formatVariantForDisplay,
  formatAvailableVariants,
} from '../../../../src/util/flags/resolve-variant';
import type { FlagVariant } from '../../../../src/util/flags/types';

describe('resolve-variant', () => {
  const booleanVariants: FlagVariant[] = [
    { id: 'variant_abc123', value: true, label: 'Enabled' },
    { id: 'variant_def456', value: false, label: 'Disabled' },
  ];

  const stringVariants: FlagVariant[] = [
    { id: 'variant_str1', value: 'control', label: 'Control Group' },
    { id: 'variant_str2', value: 'variant-a', label: 'Variant A' },
    { id: 'variant_str3', value: 'off' },
  ];

  const numberVariants: FlagVariant[] = [
    { id: 'variant_num1', value: 0, label: 'Zero' },
    { id: 'variant_num2', value: 100, label: 'Full' },
    { id: 'variant_num3', value: 50 },
  ];

  const jsonVariants: FlagVariant[] = [
    {
      id: 'variant_json_control',
      value: { variantId: 'control', params: { layout: 'a' } },
      label: 'Control',
    },
    {
      id: 'variant_json_treatment',
      value: { variantId: 'treatment', params: { layout: 'b' } },
      label: 'Treatment',
    },
  ];

  describe('resolveVariant', () => {
    describe('resolution by ID', () => {
      it('resolves variant by exact ID match', () => {
        const result = resolveVariant('variant_abc123', booleanVariants);
        expect(result.error).toBeNull();
        expect(result.variant?.id).toBe('variant_abc123');
        expect(result.variant?.value).toBe(true);
      });

      it('prefers ID match over value match', () => {
        // If a variant ID happens to be "true", it should match by ID
        const variantsWithIdMatchingValue: FlagVariant[] = [
          { id: 'true', value: 'something-else' },
          { id: 'other', value: true },
        ];
        const result = resolveVariant('true', variantsWithIdMatchingValue);
        expect(result.error).toBeNull();
        expect(result.variant?.id).toBe('true');
        expect(result.variant?.value).toBe('something-else');
      });
    });

    describe('resolution by value', () => {
      it('resolves "true" to variant with boolean true value', () => {
        const result = resolveVariant('true', booleanVariants);
        expect(result.error).toBeNull();
        expect(result.variant?.id).toBe('variant_abc123');
        expect(result.variant?.value).toBe(true);
      });

      it('resolves "false" to variant with boolean false value', () => {
        const result = resolveVariant('false', booleanVariants);
        expect(result.error).toBeNull();
        expect(result.variant?.id).toBe('variant_def456');
        expect(result.variant?.value).toBe(false);
      });

      it('resolves "TRUE" case-insensitively to boolean true', () => {
        const result = resolveVariant('TRUE', booleanVariants);
        expect(result.error).toBeNull();
        expect(result.variant?.id).toBe('variant_abc123');
        expect(result.variant?.value).toBe(true);
      });

      it('resolves "FALSE" case-insensitively to boolean false', () => {
        const result = resolveVariant('FALSE', booleanVariants);
        expect(result.error).toBeNull();
        expect(result.variant?.id).toBe('variant_def456');
        expect(result.variant?.value).toBe(false);
      });

      it('resolves string value "off" for string variants', () => {
        const result = resolveVariant('off', stringVariants);
        expect(result.error).toBeNull();
        expect(result.variant?.id).toBe('variant_str3');
        expect(result.variant?.value).toBe('off');
      });

      it('resolves numeric value by string match', () => {
        const result = resolveVariant('100', numberVariants);
        expect(result.error).toBeNull();
        expect(result.variant?.id).toBe('variant_num2');
        expect(result.variant?.value).toBe(100);
      });

      it('resolves "0" to variant with numeric 0', () => {
        const result = resolveVariant('0', numberVariants);
        expect(result.error).toBeNull();
        expect(result.variant?.id).toBe('variant_num1');
        expect(result.variant?.value).toBe(0);
      });

      it('resolves string value exactly', () => {
        const result = resolveVariant('control', stringVariants);
        expect(result.error).toBeNull();
        expect(result.variant?.id).toBe('variant_str1');
      });

      it('resolves json variant by variantId', () => {
        const result = resolveVariant('treatment', jsonVariants);
        expect(result.error).toBeNull();
        expect(result.variant?.id).toBe('variant_json_treatment');
        expect(result.variant?.value).toEqual({
          variantId: 'treatment',
          params: { layout: 'b' },
        });
      });

      it('resolves json variant by stable variant id', () => {
        const result = resolveVariant('variant_json_control', jsonVariants);
        expect(result.error).toBeNull();
        expect(result.variant?.id).toBe('variant_json_control');
      });
    });

    describe('label handling', () => {
      it('does not resolve variant by label', () => {
        const result = resolveVariant('Enabled', booleanVariants);
        expect(result.variant).toBeNull();
        expect(result.error).toContain('Variant "Enabled" not found');
        expect(result.error).toContain(
          'You can specify a variant by its ID or value.'
        );
      });

      it('does not resolve variant by label with different case', () => {
        const result = resolveVariant('enabled', booleanVariants);
        expect(result.variant).toBeNull();
        expect(result.error).toContain('Variant "enabled" not found');
        expect(result.error).toContain('Enabled');
        expect(result.error).toContain('Disabled');
      });

      it('shows labels in available variants when a label-like selector is used', () => {
        const result = resolveVariant('Control Group', stringVariants);
        expect(result.variant).toBeNull();
        expect(result.error).toContain('Variant "Control Group" not found');
        expect(result.error).toContain('Control Group');
        expect(result.error).toContain('Variant A');
      });
    });

    describe('error handling', () => {
      it('returns error for non-existent variant', () => {
        const result = resolveVariant('nonexistent', booleanVariants);
        expect(result.variant).toBeNull();
        expect(result.error).toContain('Variant "nonexistent" not found');
        expect(result.error).toContain('Available variants:');
        expect(result.error).toContain('true');
        expect(result.error).toContain('false');
      });

      it('includes helpful message in error', () => {
        const result = resolveVariant('bad-value', stringVariants);
        expect(result.error).toContain(
          'You can specify a variant by its ID or value.'
        );
      });

      it('shows labels in available variants list', () => {
        const result = resolveVariant('nonexistent', booleanVariants);
        expect(result.error).toContain('Enabled');
        expect(result.error).toContain('Disabled');
      });
    });
  });

  describe('formatVariantForDisplay', () => {
    it('formats variant with label', () => {
      const result = formatVariantForDisplay(booleanVariants[0]);
      expect(stripAnsi(result)).toBe('true Enabled');
      expect(result).toBe(`true ${chalk.dim('Enabled')}`);
    });

    it('formats variant without label', () => {
      const result = formatVariantForDisplay(stringVariants[2]);
      expect(result).toBe('"off"');
    });
  });

  describe('formatAvailableVariants', () => {
    it('formats list of variants with labels', () => {
      const result = formatAvailableVariants(booleanVariants);
      expect(stripAnsi(result)).toContain('- true Enabled');
      expect(stripAnsi(result)).toContain('- false Disabled');
      expect(result).toContain(
        `- ${chalk.bold('true')} ${chalk.dim('Enabled')}`
      );
      expect(result).toContain(
        `- ${chalk.bold('false')} ${chalk.dim('Disabled')}`
      );
    });

    it('formats list of variants without labels', () => {
      const result = formatAvailableVariants([stringVariants[2]]);
      expect(stripAnsi(result)).toContain('- "off"');
      expect(result).toContain(`- "${chalk.bold('off')}"`);
      expect(result).not.toContain('(');
    });
  });
});
