import assert from 'assert';
import { getScriptName } from '../src';

describe('Test `getScriptName()`', () => {
  it.skip('should return "vercel-*"', () => {
    const pkg = {
      scripts: {
        'vercel-dev': '',
        'vercel-build': '',
        dev: '',
        build: '',
      },
    };
    assert.equal(
      getScriptName(pkg, ['vercel-dev', 'now-dev', 'dev']),
      'vercel-dev'
    );
    assert.equal(
      getScriptName(pkg, ['vercel-build', 'now-build', 'build']),
      'vercel-build'
    );
    assert.equal(getScriptName(pkg, ['dev']), 'dev');
    assert.equal(getScriptName(pkg, ['build']), 'build');
  });

  it.skip('should return "now-*"', () => {
    const pkg = {
      scripts: {
        'now-dev': '',
        'now-build': '',
        dev: '',
        build: '',
      },
    };
    assert.equal(
      getScriptName(pkg, ['vercel-dev', 'now-dev', 'dev']),
      'now-dev'
    );
    assert.equal(
      getScriptName(pkg, ['vercel-build', 'now-build', 'build']),
      'now-build'
    );
    assert.equal(getScriptName(pkg, ['dev']), 'dev');
    assert.equal(getScriptName(pkg, ['build']), 'build');
  });

  it.skip('should return base script name', () => {
    const pkg = {
      scripts: {
        dev: '',
        build: '',
      },
    };
    assert.equal(getScriptName(pkg, ['dev']), 'dev');
    assert.equal(getScriptName(pkg, ['build']), 'build');
  });

  it.skip('should return `null`', () => {
    assert.equal(getScriptName(undefined, ['build']), null);
    assert.equal(getScriptName({}, ['build']), null);
    assert.equal(getScriptName({ scripts: {} }, ['build']), null);

    const pkg = {
      scripts: {
        dev: '',
        build: '',
      },
    };
    assert.equal(getScriptName(pkg, ['vercel-dev', 'now-dev']), null);
    assert.equal(getScriptName(pkg, ['vercel-build', 'now-build']), null);
  });
});
