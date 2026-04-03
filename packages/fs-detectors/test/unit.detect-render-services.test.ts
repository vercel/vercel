import { detectServices } from '../src';
import { detectRenderServices } from '../src/services/detect-render';
import VirtualFilesystem from './virtual-file-system';
import yaml from 'js-yaml';

function renderYaml(services: Record<string, unknown>[]): string {
  return yaml.dump({ services });
}

describe('detectRenderServices', () => {
  describe('single web service', () => {
    it('should detect a web service at root', async () => {
      const fs = new VirtualFilesystem({
        'render.yaml': renderYaml([
          {
            type: 'web',
            name: 'web',
            runtime: 'node',
            buildCommand: 'npm run build',
            startCommand: 'npm start',
          },
        ]),
        'package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
      });

      const result = await detectRenderServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(Object.keys(result.services!)).toHaveLength(1);
      expect(result.services!.web).toMatchObject({
        type: 'web',
        framework: 'nextjs',
        routePrefix: '/',
        buildCommand: 'npm run build',
      });
      expect(result.services!.web.entrypoint).toBeUndefined();
    });

    it('should detect a web service with rootDir', async () => {
      const fs = new VirtualFilesystem({
        'render.yaml': renderYaml([
          {
            type: 'web',
            name: 'frontend',
            runtime: 'node',
            rootDir: './web',
            buildCommand: 'npm run build',
          },
        ]),
        'web/package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
      });

      const result = await detectRenderServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(result.services!.frontend).toMatchObject({
        type: 'web',
        framework: 'nextjs',
        entrypoint: './web',
        routePrefix: '/',
        buildCommand: 'npm run build',
      });
    });
  });

  describe('multiple services', () => {
    it('should detect web + backend services', async () => {
      const fs = new VirtualFilesystem({
        'render.yaml': renderYaml([
          {
            type: 'web',
            name: 'web',
            runtime: 'node',
            rootDir: './frontend',
          },
          {
            type: 'web',
            name: 'api',
            runtime: 'python',
            rootDir: './api',
            buildCommand: "echo 'test'",
          },
        ]),
        'frontend/package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
        'api/requirements.txt': 'fastapi',
        'api/main.py': 'from fastapi import FastAPI',
      });

      const result = await detectRenderServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(Object.keys(result.services!)).toHaveLength(2);
      expect(result.services!.web).toMatchObject({
        framework: 'nextjs',
        entrypoint: './frontend',
        routePrefix: '/',
      });
      expect(result.services!.api).toMatchObject({
        framework: 'fastapi',
        entrypoint: './api',
        routePrefix: '/_/api',
        buildCommand: "echo 'test'",
      });
    });

    it('should handle multiple frontends and warn', async () => {
      const fs = new VirtualFilesystem({
        'render.yaml': renderYaml([
          {
            type: 'web',
            name: 'web',
            runtime: 'node',
            rootDir: './site-a',
          },
          {
            type: 'web',
            name: 'dashboard',
            runtime: 'node',
            rootDir: './site-b',
          },
        ]),
        'site-a/package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
        'site-b/package.json': JSON.stringify({
          devDependencies: { vite: '5.0.0' },
        }),
      });

      const result = await detectRenderServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(result.services!.web.routePrefix).toBe('/');
      expect(result.services!.dashboard.routePrefix).toBe('/_/dashboard');

      // we inferred that we want "web" to be at `/`,
      // but we still want to let a user know that they might
      // need to change that
      const warning = result.warnings.find(
        w => w.code === 'MULTIPLE_FRONTENDS'
      );
      expect(warning).toBeDefined();
    });
  });

  describe('pserv type', () => {
    it('should skip pserv with a hint', async () => {
      const fs = new VirtualFilesystem({
        'render.yaml': renderYaml([
          {
            type: 'web',
            name: 'web',
            runtime: 'node',
          },
          {
            type: 'pserv',
            name: 'internal-api',
            runtime: 'python',
            rootDir: './api',
          },
        ]),
        'package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
      });

      const result = await detectRenderServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(result.services!['internal-api']).toBeUndefined();

      const hint = result.warnings.find(w => w.code === 'RENDER_PSERV_HINT');
      expect(hint).toBeDefined();
      expect(hint!.message).toContain('internal-api');
      expect(hint!.message).toContain('not yet supported');
      expect(hint!.message).toContain('"entrypoint": "./api"');
      expect(hint!.message).toContain('"routePrefix": "/_/internal-api"');
    });
  });

  describe('worker type', () => {
    it('should skip workers with a hint', async () => {
      const fs = new VirtualFilesystem({
        'render.yaml': renderYaml([
          {
            type: 'web',
            name: 'web',
            runtime: 'node',
          },
          {
            type: 'worker',
            name: 'bg-worker',
            runtime: 'node',
            rootDir: './worker',
          },
        ]),
        'package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
      });

      const result = await detectRenderServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(Object.keys(result.services!)).toHaveLength(1);
      expect(result.services!['bg-worker']).toBeUndefined();

      const hint = result.warnings.find(w => w.code === 'RENDER_WORKER_HINT');
      expect(hint).toBeDefined();
      expect(hint!.message).toContain('bg-worker');
    });

    it('should emit config hint for Python workers', async () => {
      const fs = new VirtualFilesystem({
        'render.yaml': renderYaml([
          {
            type: 'web',
            name: 'web',
            runtime: 'node',
          },
          {
            type: 'worker',
            name: 'celery-worker',
            runtime: 'python',
          },
        ]),
        'package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
      });

      const result = await detectRenderServices({ fs });

      expect(result.services!['celery-worker']).toBeUndefined();
      const hint = result.warnings.find(w => w.code === 'RENDER_WORKER_HINT');
      expect(hint).toBeDefined();
      expect(hint!.message).toContain('"type": "worker"');
      expect(hint!.message).toContain('"runtime": "python"');
      expect(hint!.message).toContain('<path-to-celery-app>');
    });
  });

  describe('cron type', () => {
    it('should skip cron services with a hint warning', async () => {
      const fs = new VirtualFilesystem({
        'render.yaml': renderYaml([
          {
            type: 'web',
            name: 'web',
            runtime: 'node',
          },
          {
            type: 'cron',
            name: 'cleanup',
            runtime: 'python',
            rootDir: './cron',
            schedule: '0 0 * * *',
            startCommand: 'python tasks.py',
          },
        ]),
        'package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
        'cron/requirements.txt': 'httpx',
        'cron/tasks.py': 'import httpx',
      });

      const result = await detectRenderServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(result.services!.cleanup).toBeUndefined();
      expect(result.services!.web).toBeDefined();

      const hint = result.warnings.find(w => w.code === 'RENDER_CRON_HINT');
      expect(hint).toBeDefined();
      expect(hint!.message).toContain('cleanup');
      expect(hint!.message).toContain('0 0 * * *');
      expect(hint!.message).toContain('"type": "cron"');
      expect(hint!.message).toContain('"runtime": "python"');
      expect(hint!.message).toContain('file entrypoint');
    });

    it('should return null when all services are crons', async () => {
      const fs = new VirtualFilesystem({
        'render.yaml': renderYaml([
          {
            type: 'cron',
            name: 'cleanup',
            runtime: 'python',
            schedule: '0 0 * * *',
          },
        ]),
      });

      const result = await detectRenderServices({ fs });

      expect(result.services).toBeNull();
      expect(result.errors).toEqual([]);
      expect(result.warnings.some(w => w.code === 'RENDER_CRON_HINT')).toBe(
        true
      );
    });
  });

  describe('preDeployCommand', () => {
    it('should combine buildCommand and preDeployCommand', async () => {
      const fs = new VirtualFilesystem({
        'render.yaml': renderYaml([
          {
            type: 'web',
            name: 'api',
            runtime: 'python',
            buildCommand: 'pip install -r requirements.txt',
            preDeployCommand: 'python manage.py migrate',
          },
        ]),
        'requirements.txt': 'django',
        'manage.py': 'import django',
      });

      const result = await detectRenderServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services!.api.buildCommand).toBe(
        'pip install -r requirements.txt && python manage.py migrate'
      );
    });

    it('should use preDeployCommand alone when no buildCommand', async () => {
      const fs = new VirtualFilesystem({
        'render.yaml': renderYaml([
          {
            type: 'web',
            name: 'api',
            runtime: 'python',
            preDeployCommand: 'python manage.py migrate',
          },
        ]),
        'requirements.txt': 'django',
        'manage.py': 'import django',
      });

      const result = await detectRenderServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services!.api.buildCommand).toBe(
        'python manage.py migrate'
      );
    });
  });

  describe('unknown runtimes', () => {
    it('should still detect framework when runtime is docker', async () => {
      const fs = new VirtualFilesystem({
        'render.yaml': renderYaml([
          {
            type: 'web',
            name: 'custom',
            runtime: 'docker',
            rootDir: './custom',
          },
        ]),
        'custom/package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
      });

      const result = await detectRenderServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(result.services!.custom).toMatchObject({
        framework: 'nextjs',
        routePrefix: '/',
      });
    });

    it('should skip with warning when runtime is unknown and no framework detected', async () => {
      const fs = new VirtualFilesystem({
        'render.yaml': renderYaml([
          {
            type: 'web',
            name: 'app',
            runtime: 'elixir',
          },
        ]),
        'mix.exs': 'defmodule(App.MixProject, do: nil)',
      });

      const result = await detectRenderServices({ fs });

      expect(result.services).toBeNull();
      const warning = result.warnings.find(w => w.code === 'SERVICE_SKIPPED');
      expect(warning).toBeDefined();
      expect(warning!.message).toContain('app');
    });
  });

  describe('keyvalue type', () => {
    it('should silently skip keyvalue services', async () => {
      const fs = new VirtualFilesystem({
        'render.yaml': renderYaml([
          {
            type: 'web',
            name: 'web',
            runtime: 'node',
          },
          {
            type: 'keyvalue',
            name: 'cache',
          },
        ]),
        'package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
      });

      const result = await detectRenderServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(Object.keys(result.services!)).toHaveLength(1);
      expect(result.services!.web).toBeDefined();
      expect(result.services!.cache).toBeUndefined();
      expect(
        result.warnings.find(w => w.serviceName === 'cache')
      ).toBeUndefined();
    });
  });

  describe('static type', () => {
    it('should map static to web service', async () => {
      const fs = new VirtualFilesystem({
        'render.yaml': renderYaml([
          {
            type: 'static',
            name: 'docs',
            rootDir: './docs',
            buildCommand: 'npm run build',
          },
        ]),
        'docs/package.json': JSON.stringify({
          devDependencies: { vite: '5.0.0' },
        }),
      });

      const result = await detectRenderServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(result.services!.docs).toMatchObject({
        type: 'web',
        framework: 'vite',
        entrypoint: './docs',
        routePrefix: '/',
        buildCommand: 'npm run build',
      });
    });
  });

  describe('config parsing', () => {
    it('should emit warning on invalid YAML', async () => {
      const fs = new VirtualFilesystem({
        'render.yaml': '{{invalid yaml: [[[',
      });

      const result = await detectRenderServices({ fs });

      expect(result.services).toBeNull();
      const warning = result.warnings.find(
        w => w.code === 'RENDER_PARSE_ERROR'
      );
      expect(warning).toBeDefined();
      expect(warning!.message).toContain('render.yaml');
    });

    it('should return null when no render.yaml found', async () => {
      const fs = new VirtualFilesystem({
        'package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
      });

      const result = await detectRenderServices({ fs });

      expect(result.services).toBeNull();
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should return null when render.yaml has no services', async () => {
      const fs = new VirtualFilesystem({
        'render.yaml': yaml.dump({ databases: [{ name: 'mydb' }] }),
      });

      const result = await detectRenderServices({ fs });

      expect(result.services).toBeNull();
      expect(result.errors).toEqual([]);
    });

    it('should warn on service with no name', async () => {
      const fs = new VirtualFilesystem({
        'render.yaml': renderYaml([
          {
            type: 'web',
            runtime: 'node',
          },
        ]),
        'package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
      });

      const result = await detectRenderServices({ fs });

      expect(result.services).toBeNull();
      const warning = result.warnings.find(
        w => w.code === 'RENDER_CONFIG_ERROR'
      );
      expect(warning).toBeDefined();
      expect(warning!.message).toContain('no name');
    });
  });

  describe('error cases', () => {
    it('should error on duplicate service names', async () => {
      const fs = new VirtualFilesystem({
        'render.yaml': renderYaml([
          {
            type: 'web',
            name: 'api',
            runtime: 'python',
            rootDir: './api-v1',
          },
          {
            type: 'web',
            name: 'api',
            runtime: 'python',
            rootDir: './api-v2',
          },
        ]),
        'api-v1/requirements.txt': 'fastapi',
        'api-v1/main.py': 'from fastapi import FastAPI',
        'api-v2/requirements.txt': 'flask',
        'api-v2/index.py': 'from flask import Flask',
      });

      const result = await detectRenderServices({ fs });

      expect(result.services).toBeNull();
      const dupError = result.errors.find(e => e.code === 'DUPLICATE_SERVICE');
      expect(dupError).toBeDefined();
      expect(dupError!.serviceName).toBe('api');
    });

    it('should skip service with no framework detected', async () => {
      const fs = new VirtualFilesystem({
        'render.yaml': renderYaml([
          {
            type: 'web',
            name: 'web',
            runtime: 'node',
          },
          {
            type: 'web',
            name: 'empty',
            runtime: 'node',
            rootDir: './empty',
          },
        ]),
        'package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
        'empty/package.json': JSON.stringify({ name: 'empty' }),
      });

      const result = await detectRenderServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(Object.keys(result.services!)).toHaveLength(1);
      expect(result.services!.web).toBeDefined();
      expect(result.services!.empty).toBeUndefined();

      const skipWarning = result.warnings.find(
        w => w.code === 'SERVICE_SKIPPED'
      );
      expect(skipWarning).toBeDefined();
      expect(skipWarning!.message).toContain('empty');
    });
  });
});

describe('detectServices with Render detection', () => {
  it('should detect Render services and return as inferred', async () => {
    const fs = new VirtualFilesystem({
      'render.yaml': renderYaml([
        {
          type: 'web',
          name: 'web',
          runtime: 'node',
          rootDir: './frontend',
        },
        {
          type: 'web',
          name: 'api',
          runtime: 'python',
          rootDir: './api',
          buildCommand: "echo 'test'",
        },
      ]),
      'frontend/package.json': JSON.stringify({
        dependencies: { next: '14.0.0' },
      }),
      'api/requirements.txt': 'fastapi',
      'api/main.py': 'from fastapi import FastAPI\napp = FastAPI()',
    });

    const result = await detectServices({ fs });

    expect(result.errors).toEqual([]);
    expect(result.source).toBe('auto-detected');
    expect(result.services).toHaveLength(0);
    expect(result.inferred).not.toBeNull();
    expect(result.inferred!.source).toBe('render');
    expect(result.inferred!.services).toHaveLength(2);
    expect(result.inferred!.config.api.buildCommand).toBe("echo 'test'");
  });

  it('should prefer Vercel config over Render', async () => {
    const fs = new VirtualFilesystem({
      'vercel.json': JSON.stringify({
        experimentalServices: {
          api: {
            entrypoint: 'api/main.py',
            routePrefix: '/api',
          },
        },
      }),
      'render.yaml': renderYaml([
        {
          type: 'web',
          name: 'api',
          runtime: 'python',
        },
      ]),
      'api/requirements.txt': 'fastapi',
      'api/main.py': 'from fastapi import FastAPI\napp = FastAPI()',
    });

    const result = await detectServices({ fs });

    expect(result.source).toBe('configured');
    expect(result.inferred).toBeNull();
  });

  it('should prefer Railway over Render', async () => {
    const fs = new VirtualFilesystem({
      'render.yaml': renderYaml([
        {
          type: 'web',
          name: 'web',
          runtime: 'node',
        },
      ]),
      'railway.json': JSON.stringify({}),
      'package.json': JSON.stringify({
        dependencies: { next: '14.0.0' },
      }),
    });

    const result = await detectServices({ fs });

    expect(result.inferred).not.toBeNull();
    expect(result.inferred!.source).toBe('railway');
  });
});
