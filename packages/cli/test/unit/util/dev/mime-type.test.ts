import getMimeType from '../../../../src/util/dev/mime-type';

describe('mime-type', () => {
  it('works with file', async () => {
    const type = getMimeType('file.css');
    expect(type).toBe('text/css; charset=utf-8');
  });

  it('works with file path', async () => {
    const type = getMimeType('somewhere/file.css');
    expect(type).toBe('text/css; charset=utf-8');
  });
});
