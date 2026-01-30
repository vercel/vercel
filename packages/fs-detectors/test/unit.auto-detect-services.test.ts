import { detectServices, autoDetectServices } from '../src';
import VirtualFilesystem from './virtual-file-system';

describe('autoDetectServices', () => {
  describe('Frontend at root, backend in backend/', () => {
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
      expect(result.services).not.toBeNull();
      expect(result.services!.frontend).toMatchObject({
        framework: 'nextjs',
        routePrefix: '/',
      });
      expect(result.services!.frontend!.workspace).toBeUndefined();
      expect(result.services!.backend).toMatchObject({
        framework: 'fastapi',
        workspace: 'backend',
        routePrefix: '/_/backend',
      });
    });

    it('should detect only Next.js at root with no backend', async () => {
      const fs = new VirtualFilesystem({
        'package.json': JSON.stringify({
          dependencies: {
            next: '14.0.0',
          },
        }),
      });

      const result = await autoDetectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(result.services!.frontend).toMatchObject({
        framework: 'nextjs',
        routePrefix: '/',
      });
      expect(result.services!.backend).toBeUndefined();
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
      expect(result.services).not.toBeNull();
      expect(result.services!.frontend).toMatchObject({
        framework: 'nextjs',
        routePrefix: '/',
      });
      expect(result.services!.backend).toBeUndefined();
    });
  });

  describe('Frontend in frontend/, backend in backend/', () => {
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
      expect(result.services).not.toBeNull();
      expect(result.services!.frontend).toMatchObject({
        framework: 'nextjs',
        workspace: 'frontend',
        routePrefix: '/',
      });
      expect(result.services!.backend).toMatchObject({
        framework: 'fastapi',
        workspace: 'backend',
        routePrefix: '/_/backend',
      });
    });

    it('should error when frontend in frontend/ has no backend', async () => {
      const fs = new VirtualFilesystem({
        'frontend/package.json': JSON.stringify({
          dependencies: {
            next: '14.0.0',
          },
        }),
      });

      const result = await autoDetectServices({ fs });

      expect(result.services).toBeNull();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('NO_BACKEND_SERVICES');
      expect(result.errors[0].message).toContain('frontend/');
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

  describe('Frontend with backend in services/', () => {
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
      expect(result.services).not.toBeNull();
      expect(Object.keys(result.services!)).toHaveLength(3);

      expect(result.services!.frontend).toMatchObject({
        framework: 'nextjs',
        workspace: 'frontend',
        routePrefix: '/',
      });
      expect(result.services!['service-a']).toMatchObject({
        framework: 'fastapi',
        workspace: 'services/service-a',
        routePrefix: '/_/service-a',
      });
      expect(result.services!['service-b']).toMatchObject({
        framework: 'flask',
        workspace: 'services/service-b',
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
      expect(result.services).not.toBeNull();
      expect(Object.keys(result.services!)).toHaveLength(2);

      expect(result.services!.frontend).toMatchObject({
        framework: 'nextjs',
        routePrefix: '/',
      });
      expect(result.services!.frontend!.workspace).toBeUndefined();
      expect(result.services!.api).toMatchObject({
        framework: 'fastapi',
        workspace: 'services/api',
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

  describe('Frontend in apps/web/ monorepo + services/', () => {
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
      expect(result.services).not.toBeNull();
      expect(Object.keys(result.services!)).toHaveLength(4);

      expect(result.services!.web).toMatchObject({
        framework: 'nextjs',
        workspace: 'apps/web',
        routePrefix: '/',
      });
      expect(result.services!.auth).toMatchObject({
        framework: 'fastapi',
        workspace: 'services/auth',
        routePrefix: '/_/auth',
      });
      expect(result.services!.payments).toMatchObject({
        framework: 'fastapi',
        workspace: 'services/payments',
        routePrefix: '/_/payments',
      });
      expect(result.services!.notifications).toMatchObject({
        framework: 'flask',
        workspace: 'services/notifications',
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
      expect(result.errors[0].message).toContain('services/backend');
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
        'package.json': JSON.stringify({
          dependencies: {
            next: '14.0.0',
          },
        }),
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.services).toHaveLength(1);
      expect(result.services[0].name).toBe('api');
      expect(result.services[0].routePrefix).toBe('/api');
    });
  });

  describe('auto-detection fallback', () => {
    it('should auto-detect services when no experimentalServices configured', async () => {
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

      expect(result.errors).toEqual([]);
      expect(result.warnings).toHaveLength(0);
      expect(result.services).toHaveLength(1);
      expect(result.services[0]).toMatchObject({
        name: 'frontend',
        framework: 'nextjs',
        routePrefix: '/',
      });
    });

    it('should auto-detect services when vercel.json does not exist', async () => {
      const fs = new VirtualFilesystem({
        'package.json': JSON.stringify({
          dependencies: {
            next: '14.0.0',
          },
        }),
      });

      const result = await detectServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.warnings).toHaveLength(0);
      expect(result.services).toHaveLength(1);
      expect(result.services[0]).toMatchObject({
        name: 'frontend',
        framework: 'nextjs',
        routePrefix: '/',
      });
    });
  });
});
