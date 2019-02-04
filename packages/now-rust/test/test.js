/* global beforeEach, describe, expect, it, jest */

let inferCargoBinaries;

beforeEach(() => {
  jest.resetAllMocks();
  jest.resetModules();
});

// src/
// |- main.rs
describe('one binary, src/main.rs', async () => {
  beforeEach(() => {
    jest.mock('fs-extra', () => Object.assign(jest.genMockFromModule('fs-extra'), {
      readdir: jest.fn(async () => ['main.rs']),
      exists: jest.fn(async p => p.endsWith('main.rs')),
    }));
    inferCargoBinaries = require('../inferCargoBinaries');
  });

  it('infers only one binary', async () => {
    const toml = {
      package: {
        name: 'foo',
      },
    };
    return expect(inferCargoBinaries(toml, '/path/to/src')).resolves.toEqual([
      'foo',
    ]);
  });
});

// [[bin]] sections in `Cargo.toml`
// `main.rs` -> `package.name`
// `bar.rs` -> `bin.name`
// src/
// |- bar.rs
// |- main.rs
describe('two binaries, src/main.rs, src/bar.rs', async () => {
  beforeEach(() => {
    jest.mock('fs-extra', () => Object.assign(jest.genMockFromModule('fs-extra'), {
      readdir: jest.fn(async () => ['main.rs', 'bar.rs']),
      exists: jest.fn(async p => p.endsWith('main.rs')),
    }));
    inferCargoBinaries = require('../inferCargoBinaries');
  });

  it('infers two binaries', async () => {
    const toml = {
      package: {
        name: 'foo',
      },
      bin: [{ name: 'bar', path: 'src/bar.rs' }],
    };
    return expect(
      (await inferCargoBinaries(toml, '/path/to/src')).sort(),
    ).toEqual(['bar', 'foo']);
  });
});

// no main.rs
// src/
// |- foo.rs
describe('one named binary, no main.rs', async () => {
  beforeEach(() => {
    jest.mock('fs-extra', () => Object.assign(jest.genMockFromModule('fs-extra'), {
      readdir: jest.fn(async () => ['bar.rs']),
    }));
    inferCargoBinaries = require('../inferCargoBinaries');
  });

  it('infers only one binary', async () => {
    const toml = {
      package: {
        name: 'foo',
      },
      bin: [{ name: 'bar', path: 'src/bar.rs' }],
    };
    return expect(
      (await inferCargoBinaries(toml, '/path/to/src')).sort(),
    ).toEqual(['bar']);
  });
});

// `src/bin` folder
// src/
// |- bin/
// |  |- bar.rs
// |  |- baz.rs
// |- main.rs
describe('multiple binaries in bin/, no [[bin]] section', async () => {
  beforeEach(() => {
    jest.mock('fs-extra', () => Object.assign(jest.genMockFromModule('fs-extra'), {
      readdir: jest.fn(async (p) => {
        if (p === '/path/to/src') {
          return ['bin', 'main.rs'];
        }
        if (p === '/path/to/src/bin') {
          return ['bar.rs', 'baz.rs'];
        }

        throw new Error('some error');
      }),
      exists: jest.fn(async p => p.endsWith('bin') || p.endsWith('main.rs')),
      stat: jest.fn(async () => ({
        isDirectory: () => true,
      })),
    }));
    inferCargoBinaries = require('../inferCargoBinaries');
  });

  it('infers three binaries', async () => {
    const toml = {
      package: {
        name: 'foo',
      },
    };
    expect((await inferCargoBinaries(toml, '/path/to/src')).sort()).toEqual([
      'bar',
      'baz',
      'foo',
    ]);
  });
});

// `src/bin` folder, bin sections ignore baz.rs
// src/
// |- bin/
// |  |- bar.rs
// |  |- baz.rs
// |- main.rs
describe('src/bin exists but one binary is ignored', async () => {
  beforeEach(() => {
    jest.mock('fs-extra', () => Object.assign(jest.genMockFromModule('fs-extra'), {
      readdir: jest.fn(async (p) => {
        if (p === '/path/to/src') {
          return ['bin', 'main.rs'];
        }
        if (p === '/path/to/src/bin') {
          return ['bar.rs', 'baz.rs'];
        }

        throw new Error('some error');
      }),
      exists: jest.fn(async p => p.endsWith('bin') || p.endsWith('main.rs')),
      stat: jest.fn(async () => ({
        isDirectory: () => true,
      })),
    }));
    inferCargoBinaries = require('../inferCargoBinaries');
  });

  it('infers only one binary', async () => {
    const toml = {
      package: {
        name: 'foo',
      },
      bin: [{ name: 'bar', path: 'src/bar.rs' }],
    };
    expect((await inferCargoBinaries(toml, '/path/to/src')).sort()).toEqual([
      'bar',
      'foo',
    ]);
  });
});
