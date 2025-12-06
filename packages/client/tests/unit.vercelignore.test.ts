import assert from 'assert';
import { join } from 'path';
import { getVercelIgnore } from '../src';
import { describe, it } from 'vitest';

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
      if (!(_err instanceof Error)) {
        throw new Error(`Error "${_err}" not instanceof Error`);
      }

      err = _err;
    }
    assert(err);
    assert.equal(
      err!.message,
      'Cannot use both a `.vercelignore` and `.nowignore` file. Please delete the `.nowignore` file.'
    );
  });

  it('Should read `.vercelignore` when prebuilt', async () => {
    const fixture = join(__dirname, 'fixtures', 'unit', 'vercelignore');
    const { ig, userIg } = await getVercelIgnore(fixture, true, 'public');

    // ig includes '*' so everything is ignored by default
    assert.equal(ig.ignores('ignore.txt'), true);
    assert.equal(ig.ignores('keep.txt'), true);

    // userIg should only reflect .vercelignore contents
    assert(userIg);
    assert.equal(userIg!.ignores('ignore.txt'), true);
    assert.equal(userIg!.ignores('keep.txt'), false);
  });
});
