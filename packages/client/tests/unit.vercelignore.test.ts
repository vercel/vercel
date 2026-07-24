import assert from 'assert';
import { join } from 'path';
import ignore from 'ignore';
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

  it('Should keep non-output files under .vercel ignored for prebuilt deploys even when a positive `.vercel` pattern was compiled first', async () => {
    // Reproduce ignore@4's string-keyed pattern cache being poisoned by a
    // positive `.vercel` compiled earlier (e.g. an in-process `vercel build`
    // reading .gitignore). Without root-anchored negations the prebuilt walk
    // would re-include `.vercel/anonymous.json` and upload the credential.
    ignore().add('.vercel').ignores('.vercel/x');

    const fixture = join(__dirname, 'fixtures', 'nowignore');
    const { ig } = await getVercelIgnore(
      fixture,
      true,
      join(fixture, '.vercel/output')
    );
    assert.equal(ig.ignores('.vercel/anonymous.json'), true);
    assert.equal(ig.ignores('.vercel/project.json'), true);
    assert.equal(ig.ignores('.vercel/output/builds.json'), false);
    assert.equal(ig.ignores('.vercel/output/static/index.html'), false);
  });
});
