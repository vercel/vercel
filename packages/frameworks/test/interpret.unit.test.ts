import { describe, test, expect } from 'vitest';
import { join } from 'path';
import { promises } from 'fs';
import { tmpdir } from 'os';
import { frameworkList } from '../src/frameworks';
import { interpretFramework, type FrameworkManifest } from '../src/interpret';
import manifest from '../src/frameworks.json';

const { mkdtemp, mkdir, writeFile } = promises;

describe('frameworks manifest interpreter', () => {
  test('manifest is non-empty and every entry interprets', () => {
    const list = manifest as unknown as FrameworkManifest;
    expect(list.length).toBeGreaterThan(0);
    for (const descriptor of list) {
      const framework = interpretFramework(descriptor);
      expect(typeof framework.getOutputDirName).toBe('function');
    }
  });

  test('frameworkList length matches manifest length', () => {
    expect(frameworkList.length).toBe(
      (manifest as unknown as FrameworkManifest).length
    );
  });

  test('every framework exposes required declarative fields', () => {
    for (const framework of frameworkList) {
      expect(framework).toHaveProperty('name');
      expect(framework).toHaveProperty('slug');
      expect(framework).toHaveProperty('settings');
      expect(typeof framework.getOutputDirName).toBe('function');
    }
  });

  test('constant output dirs resolve regardless of prefix', async () => {
    const other = frameworkList.find(f => f.slug === null);
    expect(other).toBeDefined();
    expect(await other!.getOutputDirName('')).toBe('public');
    expect(await other!.getOutputDirName('/some/prefix')).toBe('public');
  });

  test('registry override: hugo reads publishDir from config', async () => {
    const hugo = frameworkList.find(f => f.slug === 'hugo');
    expect(hugo).toBeDefined();

    const dir = await mkdtemp(join(tmpdir(), 'fw-hugo-'));
    // no config -> default
    expect(await hugo!.getOutputDirName(dir)).toBe('public');
    // config with publishDir -> override
    await writeFile(
      join(dir, 'config.json'),
      JSON.stringify({ publishDir: 'out' })
    );
    expect(await hugo!.getOutputDirName(dir)).toBe('out');
  });

  test('registry override: angular single-subdir detection', async () => {
    const angular = frameworkList.find(f => f.slug === 'angular');
    expect(angular).toBeDefined();

    const dir = await mkdtemp(join(tmpdir(), 'fw-ng-'));
    // no dist dir -> base
    expect(await angular!.getOutputDirName(dir)).toBe('dist');
    // single subdir under dist -> join(dist, sub)
    await mkdir(join(dir, 'dist', 'my-app'), { recursive: true });
    expect(await angular!.getOutputDirName(dir)).toBe(join('dist', 'my-app'));
  });

  test('registry override: gatsby function defaultRoutes fallback', async () => {
    const gatsby = frameworkList.find(f => f.slug === 'gatsby');
    expect(gatsby).toBeDefined();
    expect(typeof gatsby!.defaultRoutes).toBe('function');

    const dir = await mkdtemp(join(tmpdir(), 'fw-gatsby-'));
    const routes = await (
      gatsby!.defaultRoutes as (d: string) => Promise<unknown[]>
    )(dir);
    expect(Array.isArray(routes)).toBe(true);
    expect(routes.length).toBeGreaterThan(0);
  });
});
