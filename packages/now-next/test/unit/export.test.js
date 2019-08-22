describe('export', () => {
  it('should require by path main', async () => {
    const main = require('@now/next');
    expect(main).toBeDefined();
  });

  it('should require by path dev-server relative to index', async () => {
    const index = require('@now/next/dist/index.js');
    const server = require('@now/next/dist/dev-server.js');
    expect(index).toBeDefined();
    expect(server).toBeDefined();
  });
});
