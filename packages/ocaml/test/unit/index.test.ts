import { version, shouldServe } from '../../src/index';

describe('@vercel/ocaml', () => {
  it('should export version 3', () => {
    expect(version).toBe(3);
  });

  it('should export shouldServe function', () => {
    expect(shouldServe).toBeDefined();
    expect(typeof shouldServe).toBe('function');
  });

  it('should export build function', async () => {
    const { build } = await import('../../src/index');
    expect(build).toBeDefined();
    expect(typeof build).toBe('function');
  });

  it('should export startDevServer function', async () => {
    const { startDevServer } = await import('../../src/index');
    expect(startDevServer).toBeDefined();
    expect(typeof startDevServer).toBe('function');
  });

  it('should export prepareCache function', async () => {
    const { prepareCache } = await import('../../src/index');
    expect(prepareCache).toBeDefined();
    expect(typeof prepareCache).toBe('function');
  });
});
