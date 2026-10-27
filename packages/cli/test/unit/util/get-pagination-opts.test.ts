import { describe, expect, it } from 'vitest';
import {
  getPaginationOpts,
  INVALID_NEXT_MESSAGE,
  InvalidNextError,
  parseNumericCursor,
} from '../../../src/util/get-pagination-opts';
import getArgs from '../../../src/util/get-args';

describe('getOpts', () => {
  it('reads --next as the same number it was parsed to before it was a cursor', () => {
    for (const value of ['1584722256178', '2', '0', '1.5e12', ' 42 ']) {
      const args = getArgs([`--next=${value}`], { '--next': String });
      expect(getPaginationOpts(args)[0], value).toBe(Number(value));
    }
  });

  it('should throw an error if next is not a cursor', async () => {
    const args = getArgs([`--next=oops`], { '--next': String });
    expect(() => {
      getPaginationOpts(args);
    }).toThrowError(InvalidNextError);
    expect(() => {
      getPaginationOpts(args);
    }).toThrowError(INVALID_NEXT_MESSAGE);
  });

  it('should throw an error if limit not valid', async () => {
    for (const limit of ['abc', '101', '1.1', '-1']) {
      const args = getArgs([`--limit=${limit}`], { '--limit': Number });
      expect(() => {
        getPaginationOpts(args);
      }).toThrowError();
    }
  });

  it('keeps an invalid --limit an ordinary error, not a cursor error', () => {
    const args = getArgs(['--limit=101'], { '--limit': Number });
    expect(() => getPaginationOpts(args)).not.toThrowError(InvalidNextError);
  });
});

describe('parseNumericCursor', () => {
  it('leaves an absent cursor absent', () => {
    expect(parseNumericCursor(undefined)).toBeUndefined();
  });

  it('turns a page number or timestamp back into a number', () => {
    expect(parseNumericCursor('2')).toBe(2);
    expect(parseNumericCursor('1584722256178')).toBe(1584722256178);
    expect(parseNumericCursor('oops')).toBeNaN();
  });
});
