import assert from 'assert';
import { join } from 'path';
import { getVercelIgnore } from '../src';

describe('Test `getVercelIgnore()`', () => {
  it('Should read `.nowignore`', async () => {
    const fixture = join(__dirname, 'fixtures', 'nowignore');
    const { ig } = await getVercelIgnore(fixture);
    assert.equal(ig.ignores('ignore.txt'), true);
    assert.equal(ig.ignores('keep.txt'), false);
  });

  it('Should throw an error if `.vercelignore` and `.nowignore` exist', async () => {
    let err: Error | null = null;
    const fixture = join(__dirname, 'fixtures', 'vercelignore-and-nowignore');
    try {
      await getVercelIgnore(fixture);
    } catch (_err) {
      err = _err;
    }
    assert(err);
    assert.equal(
      err!.message,
      'Can not have both a `.vercelignore` and `.nowignore` file. Please delete the `.nowignore` file'
    );
  });
});
