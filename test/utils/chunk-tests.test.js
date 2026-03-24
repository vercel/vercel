const {
  intoChunks,
  NODE_CI_PATCH_VERSIONS,
} = require('../../utils/chunk-tests');

describe('CI Node versions (security-patched release lines)', () => {
  it('pins 20.x / 22.x / 24.x to March 2026 security releases', () => {
    expect(NODE_CI_PATCH_VERSIONS).toEqual({
      20: '20.20.2',
      22: '22.22.2',
      24: '24.14.1',
    });
  });
});

describe('it should create chunks correctly', () => {
  it('should split chunks correctly less chunks than items', () => {
    const files = ['/first', '/second', '/third'];
    expect(intoChunks(1, 2, files)).toEqual([
      ['/first', '/second'],
      ['/third'],
    ]);
  });

  it('should split chunks correctly more chunks than items', () => {
    const files = ['/first', '/second', '/third'];
    expect(intoChunks(1, 5, files)).toEqual([
      ['/first'],
      ['/second'],
      ['/third'],
    ]);
  });

  it('should split chunks correctly equal chunks with items', () => {
    const files = ['/first', '/second', '/third'];
    expect(intoChunks(1, 3, files)).toEqual([
      ['/first'],
      ['/second'],
      ['/third'],
    ]);
  });
});
