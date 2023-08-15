import { getPaginationOpts } from '../../../src/util/get-pagination-opts';
import getArgs from '../../../src/util/get-args';

describe('getOpts', () => {
  it.skip('should throw an error if next not a number', async () => {
    const args = getArgs([`--next=oops`], { '--next': Number });
    expect(() => {
      getPaginationOpts(args);
    }).toThrowError();
  });

  it.skip('should throw an error if limit not valid', async () => {
    for (let limit of ['abc', '101', '1.1', '-1']) {
      const args = getArgs([`--limit=${limit}`], { '--limit': Number });
      expect(() => {
        getPaginationOpts(args);
      }).toThrowError();
    }
  });
});
