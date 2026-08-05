import { describe, test, expect } from 'vitest';
import { join } from 'path';
import { promises, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { frameworkList } from '../src/frameworks';
import { interpretFramework, type FrameworkManifest } from '../src/interpret';

const { mkdtemp, mkdir, writeFile } = promises;

// The manifest is fetched from the API at build time; read the built artifact
// (tests run after `build`).
const manifest = JSON.parse(
  readFileSync(join(__dirname, '..', 'dist', 'frameworks.json'), 'utf8')
) as FrameworkManifest;

describe('frameworks manifest interpreter', () => {
  test('manifest is non-empty and every entry interprets', () => {
    expect(manifest.length).toBeGreaterThan(0);
    for (const descriptor of manifest) {
      const framework = interpretFramework(descriptor);
      expect(typeof framework.getOutputDirName).toBe('function');
    }
  });

  test('frameworkList length matches manifest length', () => {
    expect(frameworkList.length).toBe(manifest.length);
  });

  test('every framework exposes required declarative fields', () => {
    for (const framework of frameworkList) {
      expect(framework).toHaveProperty('name');
      expect(framework).toHaveProperty('slug');
      expect(framework).toHaveProperty('settings');
      expect(typeof framework.getOutputDirName).toBe('function');
    }
  });

  test('static strategy resolves regardless of prefix', async () => {
    const container = frameworkList.find(f => f.slug === 'container');
    expect(container).toBeDefined();
    expect(await container!.getOutputDirName('')).toBe('public');
    expect(await container!.getOutputDirName('/some/prefix')).toBe('public');
  });

  test('config-file strategy: hugo reads publishDir from config', async () => {
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

  test('single-subdir strategy: angular detection', async () => {
    const angular = frameworkList.find(f => f.slug === 'angular');
    expect(angular).toBeDefined();

    const dir = await mkdtemp(join(tmpdir(), 'fw-ng-'));
    // no dist dir -> base
    expect(await angular!.getOutputDirName(dir)).toBe('dist');
    // single subdir under dist -> join(dist, sub)
    await mkdir(join(dir, 'dist', 'my-app'), { recursive: true });
    expect(await angular!.getOutputDirName(dir)).toBe(join('dist', 'my-app'));
  });

  test('gatsby strategy: function defaultRoutes falls back', async () => {
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
