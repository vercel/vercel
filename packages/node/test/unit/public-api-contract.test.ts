import { describe, expect, test } from 'vitest';
import { readFile } from 'fs/promises';
import { createRequire } from 'module';
import { join } from 'path';

const require_ = createRequire(import.meta.url);
const packageRoot = join(__dirname, '../..');

describe('published package contract', () => {
  test('the built CommonJS entrypoint exports the Builder API', () => {
    const published = require_(join(packageRoot, 'dist/index.js'));

    expect(published.version).toBe(3);
    expect(published.build).toBeTypeOf('function');
    expect(published.prepareCache).toBeTypeOf('function');
    expect(published.startDevServer).toBeTypeOf('function');
    expect(published.shouldServe).toBeTypeOf('function');
    expect(published.diagnostics).toBeTypeOf('function');
  });

  test('the published declarations expose handler types but not Builder APIs', async () => {
    const declarations = await readFile(
      join(packageRoot, 'dist/index.d.ts'),
      'utf8'
    );

    expect(declarations).toContain('export type VercelApiHandler');
    // Characterize the current published surface: runtime Builder exports are
    // intentionally consumed with @ts-expect-error by framework adapters.
    expect(declarations).not.toContain('export declare const build');
    expect(declarations).not.toContain('export declare const prepareCache');
    expect(declarations).not.toContain('export declare const startDevServer');
  });
});
