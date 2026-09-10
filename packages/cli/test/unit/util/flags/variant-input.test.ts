import { describe, expect, it } from 'vitest';
import {
  generateVariantId,
  parseVariantInput,
  validateVariantValue,
} from '../../../../src/util/flags/variant-input';

describe('variant-input', () => {
  describe('generateVariantId', () => {
    it('generates a 21 character alphanumeric id', () => {
      const id = generateVariantId();

      expect(id).toMatch(/^[A-Za-z0-9]{21}$/);
    });
  });

  describe('validateVariantValue', () => {
    it('rejects empty values', () => {
      expect(validateVariantValue('   ', 'string')).toBe(
        'Variant value cannot be empty'
      );
    });

    it('rejects invalid number values', () => {
      expect(validateVariantValue('abc', 'number')).toBe(
        'Number variants must be valid numeric values'
      );
    });

    it('rejects invalid JSON values', () => {
      expect(validateVariantValue('{"theme":"light"', 'json')).toBe(
        'JSON variant values must be valid JSON'
      );
    });

    it('rejects invalid boolean values', () => {
      expect(validateVariantValue('maybe', 'boolean')).toBe(
        'Boolean variant values must be true or false'
      );
    });
  });

  describe('parseVariantInput', () => {
    it('parses string variants with labels', () => {
      const variant = parseVariantInput('control=Welcome back', 'string', 0);

      expect(variant.value).toBe('control');
      expect(variant.label).toBe('Welcome back');
      expect(variant.description).toBe('');
      expect(variant.id).toMatch(/^[A-Za-z0-9]{21}$/);
    });

    it('parses JSON variants and assigns a default label when omitted', () => {
      const variant = parseVariantInput('["dark","compact"]', 'json', 1);

      expect(variant.value).toEqual(['dark', 'compact']);
      expect(variant.label).toBe('Variant 2');
      expect(variant.description).toBe('');
    });

    it('parses JSON variants with labels after the final equals sign', () => {
      const variant = parseVariantInput(
        '{"theme":"light","sidebar":false}=Light',
        'json',
        0
      );

      expect(variant.value).toEqual({ theme: 'light', sidebar: false });
      expect(variant.label).toBe('Light');
    });

    it('parses unlabeled JSON variants whose value contains equals signs', () => {
      const variant = parseVariantInput('{"redirect":"/x?a=b"}', 'json', 0);

      expect(variant.value).toEqual({ redirect: '/x?a=b' });
      expect(variant.label).toBe('Variant 1');
    });

    it('splits labeled JSON variants at the separator, not at equals signs inside the value', () => {
      const variant = parseVariantInput('{"query":"a=b"}=Search', 'json', 0);

      expect(variant.value).toEqual({ query: 'a=b' });
      expect(variant.label).toBe('Search');
    });

    it('splits string variants at the first equals sign', () => {
      const variant = parseVariantInput('a=b=c', 'string', 0);

      expect(variant.value).toBe('a');
      expect(variant.label).toBe('b=c');
    });

    it('leaves string variants unlabeled when no label is provided', () => {
      const variant = parseVariantInput('control', 'string', 0);

      expect(variant.value).toBe('control');
      expect(variant.label).toBeUndefined();
    });
  });
});
