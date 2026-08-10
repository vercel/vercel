import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  collectProjectIntelligence,
  formatProjectIntelligence,
} from '../../../../src/commands/onboard/project-intelligence';

describe('project intelligence', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), 'onboard-intelligence-'));
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  /**
   * The shape this is built for: a pnpm workspace whose workspace file only
   * lists the JS package, next to a Python API the workspace file cannot see.
   */
  async function writeThreeTierFixture(): Promise<void> {
    await writeFile(
      join(cwd, 'package.json'),
      JSON.stringify({ name: 'fixture', private: true })
    );
    await writeFile(join(cwd, 'pnpm-workspace.yaml'), 'packages:\n  - web\n');
    await writeFile(join(cwd, 'docker-compose.yml'), 'services: {}\n');
    await writeFile(join(cwd, 'Makefile'), 'dev:\n\ttrue\n');
    await writeFile(join(cwd, '.env.example'), 'DATABASE_URL=\n');

    await mkdir(join(cwd, 'web'));
    await writeFile(
      join(cwd, 'web', 'package.json'),
      JSON.stringify({ name: 'web', dependencies: { vite: '^5.0.0' } })
    );
    await writeFile(join(cwd, 'web', 'nginx.conf'), 'server {}\n');
    await writeFile(join(cwd, 'web', 'Dockerfile'), 'FROM node:20\n');

    await mkdir(join(cwd, 'api'));
    await writeFile(
      join(cwd, 'api', 'pyproject.toml'),
      '[project]\nname = "api"\ndependencies = ["fastapi"]\n'
    );
    await writeFile(join(cwd, 'api', 'Dockerfile'), 'FROM python:3.12\n');

    // Noise that must not be scanned.
    await mkdir(join(cwd, 'node_modules'));
    await writeFile(join(cwd, 'node_modules', 'Dockerfile'), 'FROM scratch\n');
  }

  it('detects the workspace manager', async () => {
    await writeThreeTierFixture();
    const intelligence = await collectProjectIntelligence(cwd);
    expect(intelligence.workspaceManagers).toContain('pnpm');
  });

  it('detects frameworks per directory, including ones the workspace file omits', async () => {
    await writeThreeTierFixture();
    const intelligence = await collectProjectIntelligence(cwd);
    const byPath = Object.fromEntries(
      intelligence.frameworks.map(entry => [entry.path, entry.frameworks])
    );
    expect(byPath['web']).toContain('Vite');
    expect(byPath['api']).toContain('FastAPI');
  });

  it('lists deployment-intent files without descending into skipped directories', async () => {
    await writeThreeTierFixture();
    const intelligence = await collectProjectIntelligence(cwd);
    expect(intelligence.intentFiles).toEqual(
      expect.arrayContaining([
        'docker-compose.yml',
        'Makefile',
        '.env.example',
        join('web', 'nginx.conf'),
        join('web', 'Dockerfile'),
        join('api', 'Dockerfile'),
      ])
    );
    expect(intelligence.intentFiles).not.toContain(
      join('node_modules', 'Dockerfile')
    );
  });

  it('renders findings as facts and states when no services were inferred', async () => {
    await writeThreeTierFixture();
    const intelligence = await collectProjectIntelligence(cwd);
    const rendered = formatProjectIntelligence(intelligence);
    expect(rendered).toContain('Workspace manager: pnpm');
    expect(rendered).toContain('FastAPI');
    expect(rendered).toContain('Vite');
    expect(rendered).toContain('docker-compose.yml');
    expect(rendered).toContain('none configured or inferred');
  });

  it('renders a CLI-computed config as the starting point when services were inferred', async () => {
    const intelligence = await collectProjectIntelligence(cwd);
    intelligence.workspaceManagers = ['pnpm'];
    intelligence.proposedConfig = {
      fileName: 'vercel.json',
      content: '{\n  "services": {\n    "api": { "root": "backend" }\n  }\n}\n',
    };

    const rendered = formatProjectIntelligence(intelligence);
    expect(rendered).toContain('computed a validated `vercel.json`');
    expect(rendered).toContain('write it verbatim');
    expect(rendered).toContain('"root": "backend"');
  });

  it('infers services and renders the exact config for a blessed layout', async () => {
    // frontend/ + backend/ is one of the layouts the CLI's own detection
    // recognizes; the point of the proposed config is that this project
    // shape never requires the agent to write vercel.json by hand.
    await mkdir(join(cwd, 'frontend'));
    await writeFile(
      join(cwd, 'frontend', 'package.json'),
      JSON.stringify({ name: 'frontend', dependencies: { vite: '^5.0.0' } })
    );
    await mkdir(join(cwd, 'backend'));
    await writeFile(
      join(cwd, 'backend', 'requirements.txt'),
      'fastapi\nuvicorn\n'
    );
    await writeFile(
      join(cwd, 'backend', 'main.py'),
      'from fastapi import FastAPI\napp = FastAPI()\n'
    );

    const intelligence = await collectProjectIntelligence(cwd);

    expect(intelligence.proposedConfig).toBeDefined();
    const config = JSON.parse(intelligence.proposedConfig!.content);
    expect(config.services).toBeDefined();
    expect(config.rewrites).toBeDefined();
    // The catch-all must reach the frontend, and it must go last.
    const sources = config.rewrites.map((r: { source: string }) => r.source);
    expect(sources[sources.length - 1]).toBe('/(.*)');
  });

  it('renders nothing for a directory with nothing to report', async () => {
    const intelligence = await collectProjectIntelligence(cwd);
    expect(formatProjectIntelligence(intelligence)).toBeUndefined();
  });

  it('survives a nonexistent directory', async () => {
    const intelligence = await collectProjectIntelligence(
      join(cwd, 'does-not-exist')
    );
    expect(intelligence.frameworks).toEqual([]);
    expect(intelligence.intentFiles).toEqual([]);
  });
});
