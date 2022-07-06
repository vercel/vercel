import assert from 'assert';
import { isOfficialRuntime, isStaticRuntime } from '../src';

describe('Test `isOfficialRuntime()`', () => {
  it('should be correct', () => {
    assert.equal(true, isOfficialRuntime('static', '@vercel/static'));
    assert.equal(true, isOfficialRuntime('static', '@now/static'));
    assert.equal(false, isOfficialRuntime('static', '@vercel/static-build'));
    assert.equal(false, isOfficialRuntime('static', '@now/static-build'));

    assert.equal(true, isOfficialRuntime('node', '@vercel/node'));
    assert.equal(true, isOfficialRuntime('node', '@now/node'));
    assert.equal(true, isOfficialRuntime('node', '@vercel/node@1.0.0'));
    assert.equal(true, isOfficialRuntime('node', '@now/node@1.0.0'));
    assert.equal(false, isOfficialRuntime('node', '@my-fork/node'));
    assert.equal(false, isOfficialRuntime('node', '@now/node-server'));

    assert.equal(
      true,
      isOfficialRuntime('static-build', '@vercel/static-build')
    );
    assert.equal(true, isOfficialRuntime('static-build', '@now/static-build'));
    assert.equal(
      true,
      isOfficialRuntime('static-build', '@vercel/static-build@1.0.0')
    );
    assert.equal(false, isOfficialRuntime('static-build', '@vercel/static'));
    assert.equal(false, isOfficialRuntime('static-build', '@now/static'));
  });
});

describe('Test `isStaticRuntime()`', () => {
  it('should be correct', () => {
    assert.equal(true, isStaticRuntime('@vercel/static'));
    assert.equal(true, isStaticRuntime('@now/static'));
    assert.equal(false, isStaticRuntime('@vercel/static-build'));
    assert.equal(false, isStaticRuntime('@now/static-build'));
    assert.equal(false, isStaticRuntime('@now/node'));
  });
});
