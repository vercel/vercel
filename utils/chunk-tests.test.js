const { intoChunks } = require('./chunk-tests');

describe('it should create chunks correctly', () => {
  it('should split chunks correctly less chunks than items', () => {
    const files = ['/first', '/second', '/third'];
    expect(intoChunks(2, files)).toEqual([['/first', '/second'], ['/third']]);
  });

  it('should split chunks correctly more chunks than items', () => {
    const files = ['/first', '/second', '/third'];
    expect(intoChunks(5, files)).toEqual([['/first'], ['/second'], ['/third']]);
  });

  it('should split chunks correctly equal chunks with items', () => {
    const files = ['/first', '/second', '/third'];
    expect(intoChunks(3, files)).toEqual([['/first'], ['/second'], ['/third']]);
  });
});
