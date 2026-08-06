import { describe, expect, it } from 'vitest';
import { plainInline } from '../../../../src/commands/ship/markdown';

/**
 * Agent-authored text lands inside spans the prompt or `chalk.dim` already
 * styles (askUser questions, option descriptions), where nested ANSI breaks.
 * There the markers are stripped instead of translated — this locks that in,
 * after a session showed literal `**` in the approval-plan question.
 */
describe('plainInline', () => {
  it('strips emphasis markers without styling', () => {
    expect(plainInline('approve the **plan** with *care*')).toBe(
      'approve the plan with care'
    );
    expect(plainInline('__bold__ and ___both___ and ~~gone~~')).toBe(
      'bold and both and gone'
    );
  });

  it('unwraps code spans and links', () => {
    expect(plainInline('run `vercel build` first')).toBe(
      'run vercel build first'
    );
    expect(plainInline('see [the docs](https://vercel.com/docs)')).toBe(
      'see the docs'
    );
  });

  it('leaves snake_case and math alone', () => {
    expect(plainInline('DATABASE_URL and a*b*c stay put')).toBe(
      'DATABASE_URL and a*b*c stay put'
    );
  });

  it('adds no ANSI codes', () => {
    // eslint-disable-next-line no-control-regex
    expect(plainInline('**bold** `code` [x](y)')).not.toMatch(/\u001b/);
  });
});
