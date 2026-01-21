import { describe, expect, it } from 'vitest';
import {
  getEnvValueWarnings,
  getEnvKeyWarnings,
  formatWarnings,
  hasOnlyWhitespaceWarnings,
  trimValue,
  getPublicPrefix,
  removePublicPrefix,
} from '../../../../src/util/env/validate-env';

describe('validate-env', () => {
  describe('getEnvValueWarnings', () => {
    it('returns no warnings for normal value', () => {
      expect(getEnvValueWarnings('normal-value')).toEqual([]);
    });

    it('warns when value starts with whitespace', () => {
      const warnings = getEnvValueWarnings(' value');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toBe('starts with whitespace');
      expect(warnings[0].requiresConfirmation).toBe(false);
    });

    it('warns when value starts with tab', () => {
      const warnings = getEnvValueWarnings('\tvalue');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toBe('starts with whitespace');
    });

    it('warns when value ends with whitespace', () => {
      const warnings = getEnvValueWarnings('value ');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toBe('ends with whitespace');
      expect(warnings[0].requiresConfirmation).toBe(false);
    });

    it('warns when value ends with tab', () => {
      const warnings = getEnvValueWarnings('value\t');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toBe('ends with whitespace');
    });

    it('warns when value contains return character (\\r)', () => {
      const warnings = getEnvValueWarnings('line1\rline2');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toBe('contains newlines');
      expect(warnings[0].requiresConfirmation).toBe(false);
    });

    it('warns when value contains newline character (\\n)', () => {
      const warnings = getEnvValueWarnings('line1\nline2');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toBe('contains newlines');
    });

    it('warns when value contains null character', () => {
      const warnings = getEnvValueWarnings('value\0more');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toBe('contains null characters');
      expect(warnings[0].requiresConfirmation).toBe(false);
    });

    it('requires confirmation for empty value', () => {
      const warnings = getEnvValueWarnings('');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toBe('is empty');
      expect(warnings[0].requiresConfirmation).toBe(true);
    });

    it('warns when value is wrapped in double quotes', () => {
      const warnings = getEnvValueWarnings('"my-value"');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toBe(
        'includes surrounding quotes (these will be stored literally)'
      );
      expect(warnings[0].requiresConfirmation).toBe(false);
    });

    it('warns when value is wrapped in single quotes', () => {
      const warnings = getEnvValueWarnings("'my-value'");
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toBe(
        'includes surrounding quotes (these will be stored literally)'
      );
    });

    it('does not warn for 2-char quoted value (edge case)', () => {
      expect(getEnvValueWarnings('""')).toEqual([]);
      expect(getEnvValueWarnings("''")).toEqual([]);
    });

    it('does not warn for value with only opening quote', () => {
      expect(getEnvValueWarnings('"value')).toEqual([]);
      expect(getEnvValueWarnings("'value")).toEqual([]);
    });

    it('does not warn for value with only closing quote', () => {
      expect(getEnvValueWarnings('value"')).toEqual([]);
      expect(getEnvValueWarnings("value'")).toEqual([]);
    });

    it('returns multiple warnings for value with multiple issues', () => {
      // Note: ' "value" ' starts/ends with whitespace, not quotes
      const warnings = getEnvValueWarnings(' "value" ');
      expect(warnings).toHaveLength(2);
      expect(warnings.map(w => w.message)).toContain('starts with whitespace');
      expect(warnings.map(w => w.message)).toContain('ends with whitespace');
    });

    it('returns multiple warnings for quoted value with newline', () => {
      const warnings = getEnvValueWarnings('"line1\nline2"');
      expect(warnings).toHaveLength(2);
      expect(warnings.map(w => w.message)).toContain('contains newlines');
      expect(warnings.map(w => w.message)).toContain(
        'includes surrounding quotes (these will be stored literally)'
      );
    });

    // Stdin normalization tests
    describe('stdin normalization (trailing newline)', () => {
      it('does not warn for single trailing newline (echo "value")', () => {
        expect(getEnvValueWarnings('value\n')).toEqual([]);
      });

      it('warns for space before trailing newline (echo "value ")', () => {
        const warnings = getEnvValueWarnings('value \n');
        expect(warnings).toHaveLength(1);
        expect(warnings[0].message).toBe('ends with whitespace');
      });

      it('warns for multiline with trailing newline', () => {
        const warnings = getEnvValueWarnings('line1\nline2\n');
        expect(warnings).toHaveLength(1);
        expect(warnings[0].message).toBe('contains newlines');
      });

      it('warns for multiline without trailing newline', () => {
        const warnings = getEnvValueWarnings('line1\nline2');
        expect(warnings).toHaveLength(1);
        expect(warnings[0].message).toBe('contains newlines');
      });

      it('does not treat single newline as empty', () => {
        const warnings = getEnvValueWarnings('\n');
        expect(warnings.map(w => w.message)).not.toContain('is empty');
      });
    });
  });

  describe('getEnvKeyWarnings', () => {
    it('returns no warnings for normal key', () => {
      expect(getEnvKeyWarnings('DATABASE_URL')).toEqual([]);
    });

    it('warns for NEXT_PUBLIC_ prefix', () => {
      const warnings = getEnvKeyWarnings('NEXT_PUBLIC_API_URL');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toBe(
        'NEXT_PUBLIC_ variables can be seen by anyone visiting your site'
      );
      expect(warnings[0].requiresConfirmation).toBe(false);
    });

    it('warns for REACT_APP_ prefix', () => {
      const warnings = getEnvKeyWarnings('REACT_APP_API_URL');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toBe(
        'REACT_APP_ variables can be seen by anyone visiting your site'
      );
    });

    it('warns for VITE_ prefix', () => {
      const warnings = getEnvKeyWarnings('VITE_API_URL');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toBe(
        'VITE_ variables can be seen by anyone visiting your site'
      );
    });

    it('warns for VUE_APP_ prefix', () => {
      const warnings = getEnvKeyWarnings('VUE_APP_API_URL');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toBe(
        'VUE_APP_ variables can be seen by anyone visiting your site'
      );
    });

    it('warns for GATSBY_ prefix', () => {
      const warnings = getEnvKeyWarnings('GATSBY_API_URL');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toBe(
        'GATSBY_ variables can be seen by anyone visiting your site'
      );
    });

    it('warns for GRIDSOME_ prefix', () => {
      const warnings = getEnvKeyWarnings('GRIDSOME_API_URL');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toBe(
        'GRIDSOME_ variables can be seen by anyone visiting your site'
      );
    });

    it('warns for NUXT_PUBLIC_ prefix', () => {
      const warnings = getEnvKeyWarnings('NUXT_PUBLIC_API_URL');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toBe(
        'NUXT_PUBLIC_ variables can be seen by anyone visiting your site'
      );
    });

    it('warns for NUXT_ENV_ prefix', () => {
      const warnings = getEnvKeyWarnings('NUXT_ENV_API_URL');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toBe(
        'NUXT_ENV_ variables can be seen by anyone visiting your site'
      );
    });

    it('warns for STORYBOOK_ prefix', () => {
      const warnings = getEnvKeyWarnings('STORYBOOK_API_URL');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toBe(
        'STORYBOOK_ variables can be seen by anyone visiting your site'
      );
    });

    it('warns for EXPO_PUBLIC_ prefix', () => {
      const warnings = getEnvKeyWarnings('EXPO_PUBLIC_API_URL');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toBe(
        'EXPO_PUBLIC_ variables can be seen by anyone visiting your site'
      );
    });

    it('warns for PUBLIC_ prefix', () => {
      const warnings = getEnvKeyWarnings('PUBLIC_API_URL');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toBe(
        'PUBLIC_ variables can be seen by anyone visiting your site'
      );
    });

    it('is case-insensitive for prefix matching', () => {
      const warnings = getEnvKeyWarnings('next_public_api_url');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toBe(
        'NEXT_PUBLIC_ variables can be seen by anyone visiting your site'
      );
    });

    // Sensitive pattern tests
    describe('sensitive patterns', () => {
      it('requires confirmation for public + KEY', () => {
        const warnings = getEnvKeyWarnings('NEXT_PUBLIC_API_KEY');
        expect(warnings).toHaveLength(1);
        expect(warnings[0].message).toBe(
          'The NEXT_PUBLIC_ prefix will make API_KEY visible to anyone visiting your site'
        );
        expect(warnings[0].requiresConfirmation).toBe(true);
      });

      it('requires confirmation for public + PASSWORD', () => {
        const warnings = getEnvKeyWarnings('REACT_APP_PASSWORD');
        expect(warnings).toHaveLength(1);
        expect(warnings[0].message).toBe(
          'The REACT_APP_ prefix will make PASSWORD visible to anyone visiting your site'
        );
        expect(warnings[0].requiresConfirmation).toBe(true);
      });

      it('requires confirmation for public + SECRET', () => {
        const warnings = getEnvKeyWarnings('VITE_SECRET');
        expect(warnings).toHaveLength(1);
        expect(warnings[0].message).toBe(
          'The VITE_ prefix will make SECRET visible to anyone visiting your site'
        );
        expect(warnings[0].requiresConfirmation).toBe(true);
      });

      it('requires confirmation for public + PRIVATE', () => {
        const warnings = getEnvKeyWarnings('GATSBY_PRIVATE_KEY');
        expect(warnings).toHaveLength(1);
        expect(warnings[0].message).toBe(
          'The GATSBY_ prefix will make PRIVATE_KEY visible to anyone visiting your site'
        );
        expect(warnings[0].requiresConfirmation).toBe(true);
      });

      it('requires confirmation for public + TOKEN', () => {
        const warnings = getEnvKeyWarnings('NEXT_PUBLIC_ACCESS_TOKEN');
        expect(warnings).toHaveLength(1);
        expect(warnings[0].message).toBe(
          'The NEXT_PUBLIC_ prefix will make ACCESS_TOKEN visible to anyone visiting your site'
        );
        expect(warnings[0].requiresConfirmation).toBe(true);
      });

      it('requires confirmation for public + AUTH', () => {
        const warnings = getEnvKeyWarnings('NUXT_PUBLIC_AUTH_TOKEN');
        expect(warnings).toHaveLength(1);
        expect(warnings[0].message).toBe(
          'The NUXT_PUBLIC_ prefix will make AUTH_TOKEN visible to anyone visiting your site'
        );
        expect(warnings[0].requiresConfirmation).toBe(true);
      });

      it('requires confirmation for public + JWT', () => {
        const warnings = getEnvKeyWarnings('PUBLIC_JWT_SECRET');
        expect(warnings).toHaveLength(1);
        expect(warnings[0].message).toBe(
          'The PUBLIC_ prefix will make JWT_SECRET visible to anyone visiting your site'
        );
        expect(warnings[0].requiresConfirmation).toBe(true);
      });

      it('requires confirmation for public + SIGNATURE', () => {
        const warnings = getEnvKeyWarnings('VITE_SIGNATURE_KEY');
        expect(warnings).toHaveLength(1);
        expect(warnings[0].message).toBe(
          'The VITE_ prefix will make SIGNATURE_KEY visible to anyone visiting your site'
        );
        expect(warnings[0].requiresConfirmation).toBe(true);
      });

      it('requires confirmation for public + ACCESS', () => {
        const warnings = getEnvKeyWarnings('REACT_APP_ACCESS_KEY');
        expect(warnings).toHaveLength(1);
        expect(warnings[0].message).toBe(
          'The REACT_APP_ prefix will make ACCESS_KEY visible to anyone visiting your site'
        );
        expect(warnings[0].requiresConfirmation).toBe(true);
      });

      // Word boundary tests - should NOT match
      it('does not match KEYBOARD (no word boundary)', () => {
        const warnings = getEnvKeyWarnings('REACT_APP_KEYBOARD');
        expect(warnings).toHaveLength(1);
        expect(warnings[0].requiresConfirmation).toBe(false);
      });

      it('does not match MONKEY (no word boundary)', () => {
        const warnings = getEnvKeyWarnings('NEXT_PUBLIC_MONKEY');
        expect(warnings).toHaveLength(1);
        expect(warnings[0].requiresConfirmation).toBe(false);
      });

      it('does not match PASSWORDLESS (no word boundary)', () => {
        const warnings = getEnvKeyWarnings('NEXT_PUBLIC_PASSWORDLESS');
        expect(warnings).toHaveLength(1);
        expect(warnings[0].requiresConfirmation).toBe(false);
      });

      it('does not match ACCESSIBLE (no word boundary)', () => {
        const warnings = getEnvKeyWarnings('VITE_ACCESSIBLE');
        expect(warnings).toHaveLength(1);
        expect(warnings[0].requiresConfirmation).toBe(false);
      });

      it('matches KEY_ at start of word', () => {
        const warnings = getEnvKeyWarnings('NEXT_PUBLIC_KEY_ID');
        expect(warnings).toHaveLength(1);
        expect(warnings[0].requiresConfirmation).toBe(true);
      });

      it('matches _KEY at end of word', () => {
        const warnings = getEnvKeyWarnings('NEXT_PUBLIC_API_KEY');
        expect(warnings).toHaveLength(1);
        expect(warnings[0].requiresConfirmation).toBe(true);
      });

      it('is case-insensitive for sensitive patterns', () => {
        const warnings = getEnvKeyWarnings('next_public_api_key');
        expect(warnings).toHaveLength(1);
        expect(warnings[0].requiresConfirmation).toBe(true);
      });
    });
  });

  describe('formatWarnings', () => {
    it('returns null for empty warnings', () => {
      expect(formatWarnings([])).toBeNull();
    });

    it('formats single warning', () => {
      const warnings = [{ message: 'is empty', requiresConfirmation: true }];
      expect(formatWarnings(warnings)).toBe('Value is empty');
    });

    it('formats two warnings with "and"', () => {
      const warnings = [
        { message: 'is empty', requiresConfirmation: true },
        { message: 'is wrapped in quotes', requiresConfirmation: false },
      ];
      expect(formatWarnings(warnings)).toBe(
        'Value is empty and is wrapped in quotes'
      );
    });

    it('combines start/end whitespace warnings', () => {
      const warnings = [
        { message: 'starts with whitespace', requiresConfirmation: false },
        { message: 'ends with whitespace', requiresConfirmation: false },
      ];
      expect(formatWarnings(warnings)).toBe(
        'Value starts and ends with whitespace'
      );
    });

    it('formats three+ warnings with commas and "and"', () => {
      const warnings = [
        { message: 'is empty', requiresConfirmation: true },
        { message: 'contains newlines', requiresConfirmation: false },
        { message: 'is wrapped in quotes', requiresConfirmation: false },
      ];
      expect(formatWarnings(warnings)).toBe(
        'Value is empty, contains newlines, and is wrapped in quotes'
      );
    });

    it('combines whitespace with other warnings', () => {
      const warnings = [
        { message: 'starts with whitespace', requiresConfirmation: false },
        { message: 'ends with whitespace', requiresConfirmation: false },
        { message: 'contains newlines', requiresConfirmation: false },
      ];
      expect(formatWarnings(warnings)).toBe(
        'Value starts and ends with whitespace and contains newlines'
      );
    });
  });

  describe('hasOnlyWhitespaceWarnings', () => {
    it('returns false for empty warnings', () => {
      expect(hasOnlyWhitespaceWarnings([])).toBe(false);
    });

    it('returns true for only "starts with whitespace"', () => {
      const warnings = [
        { message: 'starts with whitespace', requiresConfirmation: false },
      ];
      expect(hasOnlyWhitespaceWarnings(warnings)).toBe(true);
    });

    it('returns true for only "ends with whitespace"', () => {
      const warnings = [
        { message: 'ends with whitespace', requiresConfirmation: false },
      ];
      expect(hasOnlyWhitespaceWarnings(warnings)).toBe(true);
    });

    it('returns true for both whitespace warnings', () => {
      const warnings = [
        { message: 'starts with whitespace', requiresConfirmation: false },
        { message: 'ends with whitespace', requiresConfirmation: false },
      ];
      expect(hasOnlyWhitespaceWarnings(warnings)).toBe(true);
    });

    it('returns false for non-whitespace warnings', () => {
      const warnings = [
        { message: 'is wrapped in quotes', requiresConfirmation: false },
      ];
      expect(hasOnlyWhitespaceWarnings(warnings)).toBe(false);
    });

    it('returns false for mixed whitespace and other warnings', () => {
      const warnings = [
        { message: 'starts with whitespace', requiresConfirmation: false },
        { message: 'contains newlines', requiresConfirmation: false },
      ];
      expect(hasOnlyWhitespaceWarnings(warnings)).toBe(false);
    });
  });

  describe('trimValue', () => {
    it('trims leading whitespace', () => {
      expect(trimValue('  value')).toBe('value');
    });

    it('trims trailing whitespace', () => {
      expect(trimValue('value  ')).toBe('value');
    });

    it('trims both leading and trailing whitespace', () => {
      expect(trimValue('  value  ')).toBe('value');
    });

    it('strips trailing newline before trimming', () => {
      expect(trimValue('value\n')).toBe('value');
    });

    it('handles trailing newline with whitespace', () => {
      expect(trimValue('  value  \n')).toBe('value');
    });

    it('preserves value with no whitespace', () => {
      expect(trimValue('value')).toBe('value');
    });

    it('trims tabs', () => {
      expect(trimValue('\tvalue\t')).toBe('value');
    });
  });

  describe('getPublicPrefix', () => {
    it('returns NEXT_PUBLIC_ for Next.js public vars', () => {
      expect(getPublicPrefix('NEXT_PUBLIC_API_KEY')).toBe('NEXT_PUBLIC_');
    });

    it('returns REACT_APP_ for Create React App vars', () => {
      expect(getPublicPrefix('REACT_APP_URL')).toBe('REACT_APP_');
    });

    it('returns VITE_ for Vite vars', () => {
      expect(getPublicPrefix('VITE_SECRET')).toBe('VITE_');
    });

    it('is case-insensitive', () => {
      expect(getPublicPrefix('next_public_key')).toBe('NEXT_PUBLIC_');
    });

    it('returns null for non-public vars', () => {
      expect(getPublicPrefix('DATABASE_URL')).toBeNull();
      expect(getPublicPrefix('API_KEY')).toBeNull();
    });
  });

  describe('removePublicPrefix', () => {
    it('removes NEXT_PUBLIC_ prefix', () => {
      expect(removePublicPrefix('NEXT_PUBLIC_API_KEY')).toBe('API_KEY');
    });

    it('removes REACT_APP_ prefix', () => {
      expect(removePublicPrefix('REACT_APP_URL')).toBe('URL');
    });

    it('removes VITE_ prefix', () => {
      expect(removePublicPrefix('VITE_SECRET')).toBe('SECRET');
    });

    it('preserves case of remaining key', () => {
      expect(removePublicPrefix('next_public_api_key')).toBe('api_key');
    });

    it('returns key unchanged if no public prefix', () => {
      expect(removePublicPrefix('DATABASE_URL')).toBe('DATABASE_URL');
    });
  });
});
