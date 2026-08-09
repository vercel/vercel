import { describe, expect, it } from 'vitest';
import { getPaginationOpts } from '../../../src/util/get-pagination-opts';
import { parseArguments } from '../../../src/util/get-args';

describe('getOpts', () => {
  it('should throw an error if next not a number', async () => {
    const args = parseArguments([`--next=oops`], { '--next': Number });
    expect(() => {
      getPaginationOpts(args.flags);
    }).toThrowError();
  });

  it('should throw an error if limit not valid', async () => {
    for (const limit of ['abc', '101', '1.1', '-1']) {
      const args = parseArguments([`--limit=${limit}`], { '--limit': Number });
      expect(() => {
        getPaginationOpts(args.flags);
      }).toThrowError();
    }
  });
});
