const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { expandTestPattern } = require('./test-glob');

const defaults = ['test/**/*.test.js'];

describe('expandTestPattern', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-glob-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function write(relativePath) {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '');
  }

  function relativeMatches(pattern) {
    return expandTestPattern(root, pattern, defaults).map(file =>
      path.relative(root, file).replace(/\\/g, '/')
    );
  }

  it('treats an extensionless positional path as a prefix', () => {
    write('test/integration-one.test.js');
    write('test/integration-two.test.js');
    write('test/integration-setup.js');
    write('test/unit.test.js');

    expect(relativeMatches('test/integration')).toEqual([
      'test/integration-one.test.js',
      'test/integration-two.test.js',
    ]);
  });

  it('includes fixture tests only when explicitly targeted', () => {
    write('test/regular.test.js');
    write('test/fixtures/framework.test.js');

    expect(relativeMatches('test/**/*.test.js')).toEqual([
      'test/regular.test.js',
    ]);
    expect(relativeMatches('test/fixtures/**/*.test.js')).toEqual([
      'test/fixtures/framework.test.js',
    ]);
  });
});
