import assert from 'assert';
import { getScriptName } from '../src';

describe('Test `getScriptName()`', () => {
  it('should return "vercel-*"', () => {
    const pkg = {
      scripts: {
        'vercel-dev': '',
        'vercel-build': '',
        dev: '',
        build: '',
      },
    };
    assert.equal(
      getScriptName('dev', pkg, { allowPlatformName: true }),
      'vercel-dev'
    );
    assert.equal(
      getScriptName('build', pkg, { allowPlatformName: true }),
      'vercel-build'
    );
    assert.equal(getScriptName('dev', pkg), 'dev');
    assert.equal(getScriptName('build', pkg), 'build');
  });

  it('should return "now-*"', () => {
    const pkg = {
      scripts: {
        'now-dev': '',
        'now-build': '',
        dev: '',
        build: '',
      },
    };
    assert.equal(
      getScriptName('dev', pkg, { allowPlatformName: true }),
      'now-dev'
    );
    assert.equal(
      getScriptName('build', pkg, { allowPlatformName: true }),
      'now-build'
    );
    assert.equal(getScriptName('dev', pkg), 'dev');
    assert.equal(getScriptName('build', pkg), 'build');
  });

  it('should return base script name', () => {
    const pkg = {
      scripts: {
        dev: '',
        build: '',
      },
    };
    assert.equal(getScriptName('dev', pkg, { allowPlatformName: true }), 'dev');
    assert.equal(
      getScriptName('build', pkg, { allowPlatformName: true }),
      'build'
    );
    assert.equal(getScriptName('dev', pkg), 'dev');
    assert.equal(getScriptName('build', pkg), 'build');
  });

  it('should return `null`', () => {
    assert.equal(getScriptName('build', undefined), null);
    assert.equal(getScriptName('build', {}), null);
    assert.equal(getScriptName('build', { scripts: {} }), null);

    const pkg = {
      scripts: {
        dev: '',
        build: '',
      },
    };
    assert.equal(getScriptName('dev', pkg, { allowBaseName: false }), null);
    assert.equal(getScriptName('build', pkg, { allowBaseName: false }), null);
  });
});
