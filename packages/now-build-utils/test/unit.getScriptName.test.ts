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
    assert.equal(getScriptName('dev', pkg), 'vercel-dev');
    assert.equal(getScriptName('build', pkg), 'vercel-build');
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
    assert.equal(getScriptName('dev', pkg), 'now-dev');
    assert.equal(getScriptName('build', pkg), 'now-build');
  });

  it('should return base script name', () => {
    const pkg = {
      scripts: {
        dev: '',
        build: '',
      },
    };
    assert.equal(getScriptName('dev', pkg), 'dev');
    assert.equal(getScriptName('build', pkg), 'build');
  });

  it('should return `null`', () => {
    assert.equal(getScriptName('build', undefined), null);
    assert.equal(getScriptName('build', {}), null);
    assert.equal(getScriptName('build', { scripts: {} }), null);
  });
});
