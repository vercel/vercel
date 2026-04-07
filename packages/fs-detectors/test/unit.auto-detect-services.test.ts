import { detectServices, autoDetectServices } from '../src';
import VirtualFilesystem from './virtual-file-system';

describe('autoDetectServices', () => {
  describe('backward compat: Frontend at root, backend in backend/', () => {
    it('should detect Next.js at root and FastAPI in backend/', async () => {
      const fs = new VirtualFilesystem({
        'package.json': JSON.stringify({
          dependencies: {
            next: '14.0.0',
          },
        }),
        'backend/pyproject.toml': '[project]\ndependencies = ["fastapi"]',
        'backend/main.py': 'from fastapi import FastAPI\napp = FastAPI()',
      });

      const result = await autoDetectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(result.services!.frontend).toMatchObject({
        framework: 'nextjs',
        routePrefix: '/',
      });
      expect(result.services!.frontend!.entrypoint).toBeUndefined();
      expect(result.services!.backend).toMatchObject({
        framework: 'fastapi',
        entrypoint: 'backend',
        routePrefix: '/_/backend',
      });
    });

    it('should return null for root-only Next.js with no backend', async () => {
      const fs = new VirtualFilesystem({
        'package.json': JSON.stringify({
          dependencies: {
            next: '14.0.0',
          },
        }),
      });

      const result = await autoDetectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).toBeNull();
    });

    it('should not add backend service if backend/ dir exists but has no framework', async () => {
      const fs = new VirtualFilesystem({
        'package.json': JSON.stringify({
          dependencies: {
            next: '14.0.0',
          },
        }),
        'backend/README.md': '# Backend',
      });

      const result = await autoDetectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).toBeNull();
    });
  });

  describe('backward compat: Frontend in frontend/, backend in backend/', () => {
    it('should detect Next.js in frontend/ and FastAPI in backend/', async () => {
      const fs = new VirtualFilesystem({
        'frontend/package.json': JSON.stringify({
          dependencies: {
            next: '14.0.0',
          },
        }),
        'backend/pyproject.toml': '[project]\ndependencies = ["fastapi"]',
        'backend/main.py': 'from fastapi import FastAPI\napp = FastAPI()',
      });

      const result = await autoDetectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(result.services!.frontend).toMatchObject({
        framework: 'nextjs',
        entrypoint: 'frontend',
        routePrefix: '/',
      });
      expect(result.services!.backend).toMatchObject({
        framework: 'fastapi',
        entrypoint: 'backend',
        routePrefix: '/_/backend',
      });
    });

    it('should return null for single service in frontend/ with no backend', async () => {
      const fs = new VirtualFilesystem({
        'frontend/package.json': JSON.stringify({
          dependencies: {
            next: '14.0.0',
          },
        }),
      });

      const result = await autoDetectServices({ fs });

      // Single service below minimum — services mode not triggered
      expect(result.services).toBeNull();
      expect(result.errors).toEqual([]);
    });

    it('should error when multiple frameworks detected in frontend/', async () => {
      const fs = new VirtualFilesystem({
        'frontend/package.json': JSON.stringify({
          dependencies: {
            next: '14.0.0',
            gatsby: '5.0.0',
          },
        }),
      });

      const result = await autoDetectServices({ fs });

      expect(result.services).toBeNull();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('MULTIPLE_FRAMEWORKS_SERVICE');
      expect(result.errors[0].message).toContain('frontend/');
    });
  });

  describe('backward compat: Frontend with backend in services/', () => {
    it('should detect frontend/ and multiple services in services/', async () => {
      const fs = new VirtualFilesystem({
        'frontend/package.json': JSON.stringify({
          dependencies: {
            next: '14.0.0',
          },
        }),
        'services/service-a/pyproject.toml':
          '[project]\ndependencies = ["fastapi"]',
        'services/service-a/main.py': 'from fastapi import FastAPI',
        'services/service-b/requirements.txt': 'flask',
        'services/service-b/index.py': 'from flask import Flask',
      });

      const result = await autoDetectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(Object.keys(result.services!)).toHaveLength(3);

      expect(result.services!.frontend).toMatchObject({
        framework: 'nextjs',
        entrypoint: 'frontend',
        routePrefix: '/',
      });
      expect(result.services!['service-a']).toMatchObject({
        framework: 'fastapi',
        entrypoint: 'services/service-a',
        routePrefix: '/_/service-a',
      });
      expect(result.services!['service-b']).toMatchObject({
        framework: 'flask',
        entrypoint: 'services/service-b',
        routePrefix: '/_/service-b',
      });
    });

    it('should detect root frontend and services/', async () => {
      const fs = new VirtualFilesystem({
        'package.json': JSON.stringify({
          dependencies: {
            next: '14.0.0',
          },
        }),
        'services/api/pyproject.toml': '[project]\ndependencies = ["fastapi"]',
        'services/api/main.py': 'from fastapi import FastAPI',
      });

      const result = await autoDetectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(Object.keys(result.services!)).toHaveLength(2);

      expect(result.services!.frontend).toMatchObject({
        framework: 'nextjs',
        routePrefix: '/',
      });
      expect(result.services!.frontend!.entrypoint).toBeUndefined();
      expect(result.services!.api).toMatchObject({
        framework: 'fastapi',
        entrypoint: 'services/api',
        routePrefix: '/_/api',
      });
    });

    it('should skip subdirectories in services/ with no framework', async () => {
      const fs = new VirtualFilesystem({
        'frontend/package.json': JSON.stringify({
          dependencies: {
            next: '14.0.0',
          },
        }),
        'services/api/pyproject.toml': '[project]\ndependencies = ["fastapi"]',
        'services/shared/README.md': '# Shared utilities',
      });

      const result = await autoDetectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(Object.keys(result.services!)).toHaveLength(2);
      expect(result.services!.frontend).toBeDefined();
      expect(result.services!.api).toBeDefined();
      expect(result.services!.shared).toBeUndefined();
    });

    it('should error when multiple frameworks detected in a service', async () => {
      const fs = new VirtualFilesystem({
        'frontend/package.json': JSON.stringify({
          dependencies: {
            next: '14.0.0',
          },
        }),
        'services/api/requirements.txt': 'flask\nfastapi',
      });

      const result = await autoDetectServices({ fs });

      expect(result.services).toBeNull();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('MULTIPLE_FRAMEWORKS_SERVICE');
      expect(result.errors[0].message).toContain('services/api');
    });
  });

  describe('backward compat: Frontend in apps/web/ monorepo + services/', () => {
    it('should detect apps/web/ and multiple services in services/', async () => {
      const fs = new VirtualFilesystem({
        'apps/web/package.json': JSON.stringify({
          dependencies: {
            next: '14.0.0',
          },
        }),
        'services/auth/pyproject.toml': '[project]\ndependencies = ["fastapi"]',
        'services/auth/main.py': 'from fastapi import FastAPI',
        'services/payments/pyproject.toml':
          '[project]\ndependencies = ["fastapi"]',
        'services/payments/main.py': 'from fastapi import FastAPI',
        'services/notifications/requirements.txt': 'flask',
      });

      const result = await autoDetectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(Object.keys(result.services!)).toHaveLength(4);

      expect(result.services!.web).toMatchObject({
        framework: 'nextjs',
        entrypoint: 'apps/web',
        routePrefix: '/',
      });
      expect(result.services!.auth).toMatchObject({
        framework: 'fastapi',
        entrypoint: 'services/auth',
        routePrefix: '/_/auth',
      });
      expect(result.services!.payments).toMatchObject({
        framework: 'fastapi',
        entrypoint: 'services/payments',
        routePrefix: '/_/payments',
      });
      expect(result.services!.notifications).toMatchObject({
        framework: 'flask',
        entrypoint: 'services/notifications',
        routePrefix: '/_/notifications',
      });
    });

    it('should error when multiple frameworks detected in apps/web/', async () => {
      const fs = new VirtualFilesystem({
        'apps/web/package.json': JSON.stringify({
          dependencies: {
            next: '14.0.0',
            gatsby: '5.0.0',
          },
        }),
      });

      const result = await autoDetectServices({ fs });

      expect(result.services).toBeNull();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('MULTIPLE_FRAMEWORKS_SERVICE');
      expect(result.errors[0].message).toContain('apps/web');
    });
  });

  describe('arbitrary directory names', () => {
    it('should detect web/ and api/ as services', async () => {
      const fs = new VirtualFilesystem({
        'web/package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
        'api/pyproject.toml': '[project]\ndependencies = ["fastapi"]',
        'api/main.py': 'from fastapi import FastAPI',
      });

      const result = await autoDetectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(result.services!.web).toMatchObject({
        framework: 'nextjs',
        entrypoint: 'web',
        routePrefix: '/',
      });
      expect(result.services!.api).toMatchObject({
        framework: 'fastapi',
        entrypoint: 'api',
        routePrefix: '/_/api',
      });
    });

    it('should detect client/ and server/ as services', async () => {
      const fs = new VirtualFilesystem({
        'client/package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
        'server/pyproject.toml': '[project]\ndependencies = ["fastapi"]',
        'server/main.py': 'from fastapi import FastAPI',
      });

      const result = await autoDetectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(result.services!.client).toMatchObject({
        framework: 'nextjs',
        entrypoint: 'client',
        routePrefix: '/',
      });
      expect(result.services!.server).toMatchObject({
        framework: 'fastapi',
        entrypoint: 'server',
        routePrefix: '/_/server',
      });
    });

    it('should detect root Next.js and api/ as services', async () => {
      const fs = new VirtualFilesystem({
        'package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
        'api/pyproject.toml': '[project]\ndependencies = ["fastapi"]',
        'api/main.py': 'from fastapi import FastAPI',
      });

      const result = await autoDetectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(Object.keys(result.services!)).toHaveLength(2);
      expect(result.services!.frontend).toMatchObject({
        framework: 'nextjs',
        routePrefix: '/',
      });
      expect(result.services!.frontend!.entrypoint).toBeUndefined();
      expect(result.services!.api).toMatchObject({
        framework: 'fastapi',
        entrypoint: 'api',
        routePrefix: '/_/api',
      });
    });

    it('should detect root backend and subdirectory frontend', async () => {
      const fs = new VirtualFilesystem({
        'pyproject.toml': '[project]\ndependencies = ["fastapi"]',
        'main.py': 'from fastapi import FastAPI',
        'dashboard/package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
      });

      const result = await autoDetectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      // Root backend gets name "api", dashboard is frontend
      expect(result.services!.api).toMatchObject({
        framework: 'fastapi',
        routePrefix: '/_/api',
      });
      expect(result.services!.api!.entrypoint).toBeUndefined();
      expect(result.services!.dashboard).toMatchObject({
        framework: 'nextjs',
        entrypoint: 'dashboard',
        routePrefix: '/',
      });
    });
  });

  describe('auto-detected parent directories', () => {
    it('should scan children of directories without frameworks', async () => {
      const fs = new VirtualFilesystem({
        'projects/dashboard/package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
        'projects/api/pyproject.toml': '[project]\ndependencies = ["fastapi"]',
        'projects/api/main.py': 'from fastapi import FastAPI',
      });

      const result = await autoDetectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(result.services!.dashboard).toMatchObject({
        framework: 'nextjs',
        entrypoint: 'projects/dashboard',
        routePrefix: '/',
      });
      expect(result.services!.api).toMatchObject({
        framework: 'fastapi',
        entrypoint: 'projects/api',
        routePrefix: '/_/api',
      });
    });

    it('should detect apps/web/ + apps/docs/ + api/', async () => {
      const fs = new VirtualFilesystem({
        'apps/web/package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
        'apps/docs/package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
        'api/pyproject.toml': '[project]\ndependencies = ["fastapi"]',
        'api/main.py': 'from fastapi import FastAPI',
      });

      const result = await autoDetectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(Object.keys(result.services!)).toHaveLength(3);

      // "web" preferred for / when multiple frontends
      expect(result.services!.web).toMatchObject({
        framework: 'nextjs',
        entrypoint: 'apps/web',
        routePrefix: '/',
      });
      expect(result.services!.docs).toMatchObject({
        framework: 'nextjs',
        entrypoint: 'apps/docs',
        routePrefix: '/_/docs',
      });
      expect(result.services!.api).toMatchObject({
        framework: 'fastapi',
        entrypoint: 'api',
        routePrefix: '/_/api',
      });
      // Should emit MULTIPLE_FRONTENDS warning
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe('MULTIPLE_FRONTENDS');
    });

    it('should detect packages/web/ and packages/api/', async () => {
      const fs = new VirtualFilesystem({
        'packages/web/package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
        'packages/api/pyproject.toml': '[project]\ndependencies = ["fastapi"]',
        'packages/api/main.py': 'from fastapi import FastAPI',
      });

      const result = await autoDetectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(result.services!.web).toMatchObject({
        framework: 'nextjs',
        entrypoint: 'packages/web',
        routePrefix: '/',
      });
      expect(result.services!.api).toMatchObject({
        framework: 'fastapi',
        entrypoint: 'packages/api',
        routePrefix: '/_/api',
      });
    });

    it('should skip packages with no framework in parent dirs', async () => {
      const fs = new VirtualFilesystem({
        'packages/ui/package.json': JSON.stringify({
          dependencies: { react: '18.0.0' },
        }),
        'packages/web/package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
        'packages/api/pyproject.toml': '[project]\ndependencies = ["fastapi"]',
        'packages/api/main.py': 'from fastapi import FastAPI',
      });

      const result = await autoDetectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(Object.keys(result.services!)).toHaveLength(2);
      expect(result.services!.web).toBeDefined();
      expect(result.services!.api).toBeDefined();
      expect(result.services!.ui).toBeUndefined();
    });

    it('should not scan deeper than one level in parent dirs', async () => {
      const fs = new VirtualFilesystem({
        'frontend/package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
        // Deep nesting: projects/team/api/ should not be found
        'projects/team/api/pyproject.toml':
          '[project]\ndependencies = ["fastapi"]',
      });

      const result = await autoDetectServices({ fs });

      // Only "frontend" found, "projects/team/api" is too deep
      expect(result.services).toBeNull();
      expect(result.errors).toEqual([]);
    });
  });

  describe('multiple frontends', () => {
    it('should prefer "web" name for root route when multiple frontends', async () => {
      const fs = new VirtualFilesystem({
        'web/package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
        'admin/package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
        'api/pyproject.toml': '[project]\ndependencies = ["fastapi"]',
        'api/main.py': 'from fastapi import FastAPI',
      });

      const result = await autoDetectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(result.services!.web!.routePrefix).toBe('/');
      expect(result.services!.admin!.routePrefix).toBe('/_/admin');
      expect(result.services!.api!.routePrefix).toBe('/_/api');
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe('MULTIPLE_FRONTENDS');
    });

    it('should prefer "frontend" name for root route when multiple frontends', async () => {
      const fs = new VirtualFilesystem({
        'frontend/package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
        'admin/package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
        'api/pyproject.toml': '[project]\ndependencies = ["fastapi"]',
        'api/main.py': 'from fastapi import FastAPI',
      });

      const result = await autoDetectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(result.services!.frontend!.routePrefix).toBe('/');
      expect(result.services!.admin!.routePrefix).toBe('/_/admin');
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe('MULTIPLE_FRONTENDS');
    });

    it('should use alphabetical fallback when no preferred name exists', async () => {
      const fs = new VirtualFilesystem({
        'dashboard/package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
        'marketing/package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
        'api/pyproject.toml': '[project]\ndependencies = ["fastapi"]',
        'api/main.py': 'from fastapi import FastAPI',
      });

      const result = await autoDetectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      // "dashboard" is alphabetically first
      expect(result.services!.dashboard!.routePrefix).toBe('/');
      expect(result.services!.marketing!.routePrefix).toBe('/_/marketing');
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe('MULTIPLE_FRONTENDS');
    });
  });

  describe('name conflicts', () => {
    it('should error when service name conflicts between parent dirs', async () => {
      const fs = new VirtualFilesystem({
        'apps/api/pyproject.toml': '[project]\ndependencies = ["fastapi"]',
        'apps/api/main.py': 'from fastapi import FastAPI',
        'services/api/requirements.txt': 'flask',
        'services/api/index.py': 'from flask import Flask',
        // Need a frontend so we hit 2+ services
        'frontend/package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
      });

      const result = await autoDetectServices({ fs });

      expect(result.services).toBeNull();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('SERVICE_NAME_CONFLICT');
      expect(result.errors[0].message).toContain('api');
    });

    it('should error when service name conflicts between backend/ and services/backend/', async () => {
      const fs = new VirtualFilesystem({
        'package.json': JSON.stringify({
          dependencies: {
            next: '14.0.0',
          },
        }),
        'backend/pyproject.toml': '[project]\ndependencies = ["fastapi"]',
        'backend/main.py': 'from fastapi import FastAPI',
        'services/backend/requirements.txt': 'flask',
        'services/backend/index.py': 'from flask import Flask',
      });

      const result = await autoDetectServices({ fs });

      expect(result.services).toBeNull();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('SERVICE_NAME_CONFLICT');
      expect(result.errors[0].message).toContain('backend');
    });

    it('should pick fallback name for root when preferred name is taken', async () => {
      const fs = new VirtualFilesystem({
        'package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
        // "frontend" dir exists with a different framework
        'frontend/pyproject.toml': '[project]\ndependencies = ["fastapi"]',
        'frontend/main.py': 'from fastapi import FastAPI',
      });

      const result = await autoDetectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      // Root gets "app" since "frontend" is taken
      expect(result.services!.app).toMatchObject({
        framework: 'nextjs',
        routePrefix: '/',
      });
      expect(result.services!.app!.entrypoint).toBeUndefined();
      expect(result.services!.frontend).toMatchObject({
        framework: 'fastapi',
        entrypoint: 'frontend',
        routePrefix: '/_/frontend',
      });
    });
  });

  describe('skip directories', () => {
    it('should skip node_modules directory', async () => {
      const fs = new VirtualFilesystem({
        'web/package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
        'api/pyproject.toml': '[project]\ndependencies = ["fastapi"]',
        'api/main.py': 'from fastapi import FastAPI',
        // node_modules should be ignored
        'node_modules/some-pkg/package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
      });

      const result = await autoDetectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(Object.keys(result.services!)).toHaveLength(2);
      expect(result.services!.web).toBeDefined();
      expect(result.services!.api).toBeDefined();
    });

    it('should skip dot-prefixed directories', async () => {
      const fs = new VirtualFilesystem({
        'web/package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
        'api/pyproject.toml': '[project]\ndependencies = ["fastapi"]',
        'api/main.py': 'from fastapi import FastAPI',
        '.next/package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
      });

      const result = await autoDetectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(Object.keys(result.services!)).toHaveLength(2);
    });
  });

  describe('error cases', () => {
    it('should error when multiple frameworks detected at root', async () => {
      const fs = new VirtualFilesystem({
        'package.json': JSON.stringify({
          dependencies: {
            next: '14.0.0',
            gatsby: '5.0.0',
          },
        }),
      });

      const result = await autoDetectServices({ fs });

      expect(result.services).toBeNull();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('MULTIPLE_FRAMEWORKS_ROOT');
      expect(result.errors[0].message).toContain('Multiple frameworks');
    });

    it('should error when multiple frameworks detected in backend', async () => {
      const fs = new VirtualFilesystem({
        'package.json': JSON.stringify({
          dependencies: {
            next: '14.0.0',
          },
        }),
        'backend/requirements.txt': 'flask\nfastapi',
      });

      const result = await autoDetectServices({ fs });

      expect(result.services).toBeNull();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('MULTIPLE_FRAMEWORKS_SERVICE');
      expect(result.errors[0].message).toContain('backend');
    });

    it('should return NO_SERVICES_CONFIGURED when no frameworks found anywhere', async () => {
      const fs = new VirtualFilesystem({
        'README.md': '# My Project',
        'src/utils.ts': 'export const x = 1;',
      });

      const result = await autoDetectServices({ fs });

      expect(result.services).toBeNull();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('NO_SERVICES_CONFIGURED');
    });

    it('should return null with no errors for single-service projects', async () => {
      const fs = new VirtualFilesystem({
        'app/package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
      });

      const result = await autoDetectServices({ fs });

      expect(result.services).toBeNull();
      expect(result.errors).toEqual([]);
    });
  });
});

describe('detectServices with auto-detection', () => {
  describe('explicit config takes precedence', () => {
    it('should use explicit experimentalServices when configured', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          experimentalServices: {
            api: {
              entrypoint: 'src/index.ts',
              routePrefix: '/api',
            },
          },
        }),
        'src/index.ts': 'export default {}',
        'package.json': JSON.stringify({
          dependencies: {
            next: '14.0.0',
          },
        }),
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.source).toBe('configured');
      expect(result.services).toHaveLength(1);
      expect(result.services[0].name).toBe('api');
      expect(result.services[0].routePrefix).toBe('/api');
      expect(result.services[0].routePrefixSource).toBe('configured');
    });
  });

  describe('SvelteKit in frontend/, backend in backend/', () => {
    it('should detect SvelteKit in frontend/ and FastAPI in backend/', async () => {
      const fs = new VirtualFilesystem({
        'frontend/package.json': JSON.stringify({
          devDependencies: {
            '@sveltejs/adapter-auto': '^6.0.0',
            '@sveltejs/kit': '^2.0.0',
            svelte: '^5.0.0',
          },
        }),
        'backend/pyproject.toml': '[project]\ndependencies = ["fastapi"]',
        'backend/main.py': 'from fastapi import FastAPI\napp = FastAPI()',
      });

      const result = await autoDetectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(result.services!.frontend).toMatchObject({
        framework: 'sveltekit-1',
        entrypoint: 'frontend',
        routePrefix: '/',
      });
      expect(result.services!.backend).toMatchObject({
        framework: 'fastapi',
        entrypoint: 'backend',
        routePrefix: '/_/backend',
      });
    });
  });

  describe('SvelteKit at root, backend in backend/', () => {
    it('should detect SvelteKit at root and FastAPI in backend/', async () => {
      const fs = new VirtualFilesystem({
        'package.json': JSON.stringify({
          devDependencies: {
            '@sveltejs/adapter-auto': '^6.0.0',
            '@sveltejs/kit': '^2.0.0',
            svelte: '^5.0.0',
          },
        }),
        'backend/pyproject.toml': '[project]\ndependencies = ["fastapi"]',
        'backend/main.py': 'from fastapi import FastAPI\napp = FastAPI()',
      });

      const result = await autoDetectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(result.services!.frontend).toMatchObject({
        framework: 'sveltekit-1',
        routePrefix: '/',
      });
      expect(result.services!.backend).toMatchObject({
        framework: 'fastapi',
        entrypoint: 'backend',
        routePrefix: '/_/backend',
      });
    });
  });

  describe('auto-detection fallback', () => {
    it('should return no services for root-only project without experimentalServices', async () => {
      const fs = new VirtualFilesystem({
        'vercel.json': JSON.stringify({
          buildCommand: 'npm run build',
        }),
        'package.json': JSON.stringify({
          dependencies: {
            next: '14.0.0',
          },
        }),
      });

      const result = await detectServices({ fs });

      expect(result.source).toBe('auto-detected');
      expect(result.services).toHaveLength(0);
      expect(result.errors).toEqual([
        {
          code: 'NO_SERVICES_CONFIGURED',
          message:
            'No services configured. Add `experimentalServices` to vercel.json.',
        },
      ]);
    });

    it('should return no services for root-only project without vercel.json', async () => {
      const fs = new VirtualFilesystem({
        'package.json': JSON.stringify({
          dependencies: {
            next: '14.0.0',
          },
        }),
      });

      const result = await detectServices({ fs });

      expect(result.source).toBe('auto-detected');
      expect(result.services).toHaveLength(0);
      expect(result.errors).toEqual([
        {
          code: 'NO_SERVICES_CONFIGURED',
          message:
            'No services configured. Add `experimentalServices` to vercel.json.',
        },
      ]);
    });

    it('should mark prefixed auto-detected services as generated', async () => {
      const fs = new VirtualFilesystem({
        'package.json': JSON.stringify({
          dependencies: {
            next: '14.0.0',
          },
        }),
        'backend/pyproject.toml': '[project]\ndependencies = ["fastapi"]',
        'backend/main.py': 'from fastapi import FastAPI\napp = FastAPI()',
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.warnings).toHaveLength(0);
      expect(result.source).toBe('auto-detected');
      expect(result.services).toHaveLength(2);
      const backend = result.services.find(
        service => service.name === 'backend'
      );
      expect(backend).toBeDefined();
      expect(backend?.routePrefix).toBe('/_/backend');
      expect(backend?.routePrefixSource).toBe('generated');
    });
  });
});
