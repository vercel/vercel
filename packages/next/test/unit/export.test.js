describe('export', () => {
  it('should require by path main', async () => {
    const main = require('@vercel/next');
    expect(main).toBeDefined();
  });
});
