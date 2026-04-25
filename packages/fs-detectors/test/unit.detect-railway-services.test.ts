import { detectServices } from '../src';
import { detectRailwayServices } from '../src/services/detect-railway';
import VirtualFilesystem from './virtual-file-system';

describe('detectRailwayServices', () => {
  describe('single service at root', () => {
    it('should detect railway.json at root with Next.js', async () => {
      const fs = new VirtualFilesystem({
        'railway.json': JSON.stringify({
          build: { buildCommand: 'npm run build' },
          deploy: { startCommand: 'npm start' },
        }),
        'package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
      });

      const result = await detectRailwayServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(Object.keys(result.services!)).toHaveLength(1);
      expect(result.services!.web).toMatchObject({
        framework: 'nextjs',
        routePrefix: '/',
        buildCommand: 'npm run build',
      });
      expect(result.services!.web.entrypoint).toBeUndefined();
    });

    it('should detect railway.toml at root with FastAPI', async () => {
      const fs = new VirtualFilesystem({
        'railway.toml': [
          '[build]',
          'buildCommand = "echo \'test\'"',
          '',
          '[deploy]',
          'startCommand = "uvicorn main:app"',
        ].join('\n'),
        'requirements.txt': 'fastapi',
        'main.py': 'from fastapi import FastAPI\napp = FastAPI()',
      });

      const result = await detectRailwayServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(result.services!.web).toMatchObject({
        framework: 'fastapi',
        routePrefix: '/',
        buildCommand: "echo 'test'",
      });
    });

    it('should detect empty railway.json with framework detection', async () => {
      const fs = new VirtualFilesystem({
        'railway.json': '{}',
        'package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
      });

      const result = await detectRailwayServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(result.services!.web).toMatchObject({
        framework: 'nextjs',
        routePrefix: '/',
      });
      expect(result.services!.web.buildCommand).toBeUndefined();
    });
  });

  describe('multiple services', () => {
    it('should detect services in subdirectories', async () => {
      const fs = new VirtualFilesystem({
        'web/railway.json': JSON.stringify({}),
        'web/package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
        'api/railway.json': JSON.stringify({
          build: { buildCommand: "echo 'test'" },
        }),
        'api/requirements.txt': 'fastapi',
        'api/main.py': 'from fastapi import FastAPI',
      });

      const result = await detectRailwayServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(Object.keys(result.services!)).toHaveLength(2);
      expect(result.services!.web).toMatchObject({
        framework: 'nextjs',
        entrypoint: 'web',
        routePrefix: '/',
      });
      expect(result.services!.api).toMatchObject({
        framework: 'fastapi',
        entrypoint: 'api',
        routePrefix: '/_/api',
        buildCommand: "echo 'test'",
      });
    });

    it('should handle multiple frontends and multiple backends', async () => {
      const fs = new VirtualFilesystem({
        'web/railway.json': JSON.stringify({}),
        'web/package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
        'dashboard/railway.json': JSON.stringify({}),
        'dashboard/package.json': JSON.stringify({
          devDependencies: { vite: '5.0.0' },
        }),
        'api/railway.json': JSON.stringify({}),
        'api/requirements.txt': 'fastapi',
        'api/main.py': 'from fastapi import FastAPI',
        'workers/railway.json': JSON.stringify({}),
        'workers/requirements.txt': 'flask',
        'workers/index.py': 'from flask import Flask',
      });

      const result = await detectRailwayServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(Object.keys(result.services!)).toHaveLength(4);

      // "web" is preferred to be at /
      expect(result.services!.web).toMatchObject({
        entrypoint: 'web',
        routePrefix: '/',
      });
      expect(result.services!.dashboard.routePrefix).toBe('/_/dashboard');
      expect(result.services!.api.routePrefix).toBe('/_/api');
      expect(result.services!.workers.routePrefix).toBe('/_/workers');

      const warning = result.warnings.find(
        w => w.code === 'MULTIPLE_FRONTENDS'
      );
      expect(warning).toBeDefined();
      expect(warning!.message).toContain('web');
      expect(warning!.message).toContain('dashboard');
    });
  });

  describe('recursive scan', () => {
    it('should find configs nested in subdirectories', async () => {
      const fs = new VirtualFilesystem({
        'services/api/railway.json': JSON.stringify({}),
        'services/api/pyproject.toml': '[project]\ndependencies = ["fastapi"]',
        'services/api/main.py': 'from fastapi import FastAPI',
        'services/web/railway.json': JSON.stringify({}),
        'services/web/package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
      });

      const result = await detectRailwayServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(Object.keys(result.services!)).toHaveLength(2);
      expect(result.services!.web).toBeDefined();
      expect(result.services!.api).toBeDefined();
    });

    it('should skip node_modules directories', async () => {
      const fs = new VirtualFilesystem({
        'railway.json': JSON.stringify({}),
        'package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
        'node_modules/some-pkg/railway.json': JSON.stringify({}),
        'node_modules/some-pkg/package.json': JSON.stringify({
          dependencies: { express: '4.0.0' },
        }),
      });

      const result = await detectRailwayServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(Object.keys(result.services!)).toHaveLength(1);
      expect(result.services!.web).toBeDefined();
    });

    it('should skip .git directories', async () => {
      const fs = new VirtualFilesystem({
        'api/railway.json': JSON.stringify({}),
        'api/pyproject.toml': '[project]\ndependencies = ["fastapi"]',
        'api/main.py': 'from fastapi import FastAPI',
        '.git/hooks/railway.json': JSON.stringify({}),
      });

      const result = await detectRailwayServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(Object.keys(result.services!)).toHaveLength(1);
      expect(result.services!.api).toBeDefined();
    });
  });

  describe('schedule-triggered job hints', () => {
    it('should skip Railway scheduled jobs and emit a schedule-triggered job hint', async () => {
      const fs = new VirtualFilesystem({
        'web/railway.json': JSON.stringify({}),
        'web/package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
        'cleanup/railway.json': JSON.stringify({
          deploy: {
            cronSchedule: '0 0 * * *',
            startCommand: 'python script.py',
          },
        }),
        'cleanup/requirements.txt': 'httpx',
        'cleanup/script.py': 'import httpx; httpx.get("http://localhost:8000")',
      });

      const result = await detectRailwayServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(Object.keys(result.services!)).toHaveLength(1);
      expect(result.services!.web).toBeDefined();
      expect(result.services!.cleanup).toBeUndefined();

      const hint = result.warnings.find(w => w.code === 'RAILWAY_CRON_HINT');
      expect(hint).toBeDefined();
      expect(hint!.message).toContain('0 0 * * *');
      expect(hint!.message).toContain('"type": "job"');
      expect(hint!.message).toContain('"trigger": "schedule"');
      expect(hint!.message).toContain('"runtime": "python"');
    });

    it('should return null when all services are crons', async () => {
      const fs = new VirtualFilesystem({
        'railway.json': JSON.stringify({
          deploy: {
            cronSchedule: '0 0 * * *',
            startCommand: 'python script.py',
          },
        }),
        'requirements.txt': 'httpx',
        'script.py': 'import httpx; httpx.get("http://localhost:8000")',
      });

      const result = await detectRailwayServices({ fs });

      expect(result.services).toBeNull();
      expect(result.errors).toEqual([]);
      expect(result.warnings.some(w => w.code === 'RAILWAY_CRON_HINT')).toBe(
        true
      );
    });
  });

  describe('preDeployCommand', () => {
    it('should append preDeployCommand string to buildCommand', async () => {
      const fs = new VirtualFilesystem({
        'railway.json': JSON.stringify({
          build: { buildCommand: 'npm run build' },
          deploy: { preDeployCommand: 'npm run db:migrate' },
        }),
        'package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
      });

      const result = await detectRailwayServices({ fs });

      expect(result.services!.web.buildCommand).toBe(
        'npm run build && npm run db:migrate'
      );
    });

    it('should append preDeployCommand array to buildCommand', async () => {
      const fs = new VirtualFilesystem({
        'railway.json': JSON.stringify({
          build: { buildCommand: 'npm run build' },
          deploy: { preDeployCommand: ['npm run db:migrate'] },
        }),
        'package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
      });

      const result = await detectRailwayServices({ fs });

      expect(result.services!.web.buildCommand).toBe(
        'npm run build && npm run db:migrate'
      );
    });

    it('should use preDeployCommand alone when no buildCommand', async () => {
      const fs = new VirtualFilesystem({
        'api/railway.json': JSON.stringify({
          deploy: { preDeployCommand: 'python manage.py migrate' },
        }),
        'api/requirements.txt': 'django',
        'api/manage.py': 'import django',
      });

      const result = await detectRailwayServices({ fs });

      expect(result.services!.api.buildCommand).toBe(
        'python manage.py migrate'
      );
    });

    it('should ignore preDeployCommand when not set', async () => {
      const fs = new VirtualFilesystem({
        'railway.json': JSON.stringify({
          build: { buildCommand: 'npm run build' },
        }),
        'package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
      });

      const result = await detectRailwayServices({ fs });

      expect(result.services!.web.buildCommand).toBe('npm run build');
    });
  });

  describe('route prefix assignment', () => {
    it('should assign / to frontend framework service', async () => {
      const fs = new VirtualFilesystem({
        'web/railway.json': JSON.stringify({}),
        'web/package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
        'api/railway.json': JSON.stringify({}),
        'api/pyproject.toml': '[project]\ndependencies = ["fastapi"]',
        'api/main.py': 'from fastapi import FastAPI',
      });

      const result = await detectRailwayServices({ fs });

      expect(result.services!.web.routePrefix).toBe('/');
      expect(result.services!.api.routePrefix).toBe('/_/api');
    });

    it('should assign all to /_/ when no frontend detected', async () => {
      const fs = new VirtualFilesystem({
        'beta/railway.json': JSON.stringify({}),
        'beta/pyproject.toml': '[project]\ndependencies = ["fastapi"]',
        'beta/main.py': 'from fastapi import FastAPI',
        'alpha/railway.json': JSON.stringify({}),
        'alpha/requirements.txt': 'flask',
        'alpha/index.py': 'from flask import Flask',
      });

      const result = await detectRailwayServices({ fs });

      expect(result.services!.alpha.routePrefix).toBe('/_/alpha');
      expect(result.services!.beta.routePrefix).toBe('/_/beta');
    });

    it('should warn and pick first alphabetically when multiple frontends', async () => {
      const fs = new VirtualFilesystem({
        'site-b/railway.json': JSON.stringify({}),
        'site-b/package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
        'site-a/railway.json': JSON.stringify({}),
        'site-a/package.json': JSON.stringify({
          devDependencies: { vite: '5.0.0' },
        }),
        'api/railway.json': JSON.stringify({}),
        'api/pyproject.toml': '[project]\ndependencies = ["fastapi"]',
        'api/main.py': 'from fastapi import FastAPI',
      });

      const result = await detectRailwayServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(result.services!['site-a'].routePrefix).toBe('/');
      expect(result.services!['site-b'].routePrefix).toBe('/_/site-b');
      expect(result.services!.api.routePrefix).toBe('/_/api');

      const warning = result.warnings.find(
        w => w.code === 'MULTIPLE_FRONTENDS'
      );
      expect(warning).toBeDefined();
      expect(warning!.message).toContain('site-a');
      expect(warning!.message).toContain('site-b');
    });

    it('should prefer "web" or "frontend" name among multiple frontends', async () => {
      const fs = new VirtualFilesystem({
        'admin/railway.json': JSON.stringify({}),
        'admin/package.json': JSON.stringify({
          devDependencies: { vite: '5.0.0' },
        }),
        'web/railway.json': JSON.stringify({}),
        'web/package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
      });

      const result = await detectRailwayServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services!.web.routePrefix).toBe('/');
      expect(result.services!.admin.routePrefix).toBe('/_/admin');
    });

    it('should assign / to single service', async () => {
      const fs = new VirtualFilesystem({
        'api/railway.json': JSON.stringify({}),
        'api/pyproject.toml': '[project]\ndependencies = ["fastapi"]',
        'api/main.py': 'from fastapi import FastAPI',
      });

      const result = await detectRailwayServices({ fs });

      expect(result.services!.api.routePrefix).toBe('/');
    });
  });

  describe('config parsing', () => {
    it('should prefer railway.json over railway.toml in same directory', async () => {
      const fs = new VirtualFilesystem({
        'railway.json': JSON.stringify({
          build: { buildCommand: 'from-json' },
        }),
        'railway.toml': ['[build]', 'buildCommand = "from-toml"'].join('\n'),
        'package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
      });

      const result = await detectRailwayServices({ fs });

      expect(result.services!.web.buildCommand).toBe('from-json');
    });

    it('should emit warning on invalid JSON and skip', async () => {
      const fs = new VirtualFilesystem({
        'railway.json': 'not valid json {{{',
        'package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
      });

      const result = await detectRailwayServices({ fs });

      expect(result.services).toBeNull();
      const parseWarning = result.warnings.find(
        w => w.code === 'RAILWAY_PARSE_ERROR'
      );
      expect(parseWarning).toBeDefined();
      expect(parseWarning!.message).toContain('railway.json');
    });

    it('should emit warning on invalid TOML and skip', async () => {
      const fs = new VirtualFilesystem({
        'railway.toml': '[[[[invalid toml',
        'package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
      });

      const result = await detectRailwayServices({ fs });

      expect(result.services).toBeNull();
      const parseWarning = result.warnings.find(
        w => w.code === 'RAILWAY_PARSE_ERROR'
      );
      expect(parseWarning).toBeDefined();
      expect(parseWarning!.message).toContain('railway.toml');
    });
  });

  describe('framework detection', () => {
    it('should skip service with no framework and no buildCommand', async () => {
      const fs = new VirtualFilesystem({
        'web/railway.json': JSON.stringify({}),
        'web/package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
        'db/railway.json': JSON.stringify({}),
        'db/README.md': '# Database service',
      });

      const result = await detectRailwayServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(Object.keys(result.services!)).toHaveLength(1);
      expect(result.services!.web).toBeDefined();
      expect(result.services!.db).toBeUndefined();

      const skipWarning = result.warnings.find(
        w => w.code === 'SERVICE_SKIPPED'
      );
      expect(skipWarning).toBeDefined();
    });

    it('should skip service with buildCommand but no framework', async () => {
      const fs = new VirtualFilesystem({
        'api/railway.json': JSON.stringify({
          build: { buildCommand: 'make build' },
        }),
        'api/package.json': JSON.stringify({
          name: 'custom-app',
        }),
      });

      const result = await detectRailwayServices({ fs });

      expect(result.services).toBeNull();
      const skipWarning = result.warnings.find(
        w => w.code === 'SERVICE_SKIPPED'
      );
      expect(skipWarning).toBeDefined();
      expect(skipWarning!.message).toContain('api');
    });
  });

  describe('error cases', () => {
    it('should error on duplicate service names', async () => {
      const fs = new VirtualFilesystem({
        'api/railway.json': JSON.stringify({}),
        'api/pyproject.toml': '[project]\ndependencies = ["fastapi"]',
        'api/main.py': 'from fastapi import FastAPI',
        'services/api/railway.json': JSON.stringify({}),
        'services/api/requirements.txt': 'flask',
        'services/api/index.py': 'from flask import Flask',
      });

      const result = await detectRailwayServices({ fs });

      expect(result.services).toBeNull();
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      const dupError = result.errors.find(e => e.code === 'DUPLICATE_SERVICE');
      expect(dupError).toBeDefined();
      expect(dupError!.serviceName).toBe('api');
      expect(dupError!.message).toContain('api/');
      expect(dupError!.message).toContain('services/api/');
    });

    it('should error when root and web/ both derive service name "web"', async () => {
      const fs = new VirtualFilesystem({
        'railway.json': JSON.stringify({}),
        'package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
        'web/railway.json': JSON.stringify({}),
        'web/package.json': JSON.stringify({
          devDependencies: { vite: '5.0.0' },
        }),
      });

      const result = await detectRailwayServices({ fs });

      expect(result.services).toBeNull();
      const dupError = result.errors.find(e => e.code === 'DUPLICATE_SERVICE');
      expect(dupError).toBeDefined();
      expect(dupError!.serviceName).toBe('web');
      expect(dupError!.message).toContain('root/');
      expect(dupError!.message).toContain('web/');
    });

    it('should return null when no railway configs found', async () => {
      const fs = new VirtualFilesystem({
        'package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
      });

      const result = await detectRailwayServices({ fs });

      expect(result.services).toBeNull();
      expect(result.errors).toEqual([]);
    });
  });
});

describe('detectServices with Railway detection', () => {
  it('should use Railway detection when auto-detect finds nothing', async () => {
    const fs = new VirtualFilesystem({
      'api/railway.json': JSON.stringify({
        build: { buildCommand: "echo 'test'" },
      }),
      'api/pyproject.toml': '[project]\ndependencies = ["fastapi"]',
      'api/main.py': 'from fastapi import FastAPI\napp = FastAPI()',
      'web/railway.json': JSON.stringify({}),
      'web/package.json': JSON.stringify({
        dependencies: { next: '14.0.0' },
      }),
    });

    const result = await detectServices({ fs });

    expect(result.errors).toEqual([]);
    expect(result.source).toBe('auto-detected');
    // Railway detection is suggestion-only,
    // so resolved.services (or .services which are the same) should be empty
    expect(result.services).toHaveLength(0);
    expect(result.inferred).not.toBeNull();
    expect(result.inferred!.source).toBe('railway');
    expect(result.inferred!.services).toHaveLength(2);
    expect(result.inferred!.config.api.buildCommand).toBe("echo 'test'");
  });

  it('should prefer Railway over layout auto-detect', async () => {
    // This has both: preferred layout (root + backend) + railway config
    // we do not merge this and stick only to railway in such cases
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({
        dependencies: { next: '14.0.0' },
      }),
      'backend/pyproject.toml': '[project]\ndependencies = ["fastapi"]',
      'backend/main.py': 'from fastapi import FastAPI\napp = FastAPI()',
      'backend/railway.json': JSON.stringify({}),
    });

    const result = await detectServices({ fs });

    expect(result.errors).toEqual([]);
    expect(result.inferred).not.toBeNull();
    expect(result.inferred!.source).toBe('railway');
    expect(result.inferred!.services).toHaveLength(1);
    expect(result.inferred!.services[0].routePrefix).toBe('/');
    expect(result.inferred!.services[0].name).toBe('backend');
  });

  it('should prefer Vercel config over Railway', async () => {
    const fs = new VirtualFilesystem({
      'vercel.json': JSON.stringify({
        experimentalServices: {
          api: {
            entrypoint: 'api/main.py',
            routePrefix: '/api',
          },
        },
      }),
      'api/railway.json': JSON.stringify({}),
      'api/pyproject.toml': '[project]\ndependencies = ["fastapi"]',
      'api/main.py': 'from fastapi import FastAPI\napp = FastAPI()',
    });

    const result = await detectServices({ fs });

    expect(result.source).toBe('configured');
    expect(result.inferred).toBeNull();
  });
});
