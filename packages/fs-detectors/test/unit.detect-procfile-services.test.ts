import { detectServices } from '../src';
import { detectProcfileServices } from '../src/services/detect-procfile';
import VirtualFilesystem from './virtual-file-system';

describe('detectProcfileServices', () => {
  describe('python services', () => {
    it('should detect gunicorn with module:attr', async () => {
      const fs = new VirtualFilesystem({
        Procfile: 'web: gunicorn myapp.wsgi:application',
        'requirements.txt': 'django',
        'manage.py': 'import django',
        'myapp/wsgi.py':
          'from django.core.wsgi import get_wsgi_application\napplication = get_wsgi_application()',
      });

      const result = await detectProcfileServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(result.services!.web).toMatchObject({
        type: 'web',
        framework: 'django',
        entrypoint: 'myapp/wsgi.py',
        routePrefix: '/',
      });
    });

    it('should detect gunicorn with module only', async () => {
      const fs = new VirtualFilesystem({
        Procfile: 'web: gunicorn project.wsgi',
        'requirements.txt': 'django',
        'manage.py': 'import django',
        'project/wsgi.py':
          'from django.core.wsgi import get_wsgi_application\napplication = get_wsgi_application()',
      });

      const result = await detectProcfileServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(result.services!.web).toMatchObject({
        entrypoint: 'project/wsgi.py',
      });
    });

    it('should detect gunicorn with flags before module', async () => {
      const fs = new VirtualFilesystem({
        Procfile:
          'web: gunicorn -w 4 --bind 0.0.0.0:8000 --timeout 120 myapp.wsgi:app',
        'requirements.txt': 'django',
        'manage.py': 'import django',
        'myapp/wsgi.py':
          'from django.core.wsgi import get_wsgi_application\napplication = get_wsgi_application()',
      });

      const result = await detectProcfileServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services!.web).toMatchObject({
        entrypoint: 'myapp/wsgi.py',
      });
    });

    it('should detect gunicorn with --config flag and app module', async () => {
      const fs = new VirtualFilesystem({
        Procfile: 'web: gunicorn -c gunicorn.conf.py myapp.wsgi:app',
        'requirements.txt': 'django',
        'manage.py': 'import django',
        'myapp/wsgi.py':
          'from django.core.wsgi import get_wsgi_application\napplication = get_wsgi_application()',
      });

      const result = await detectProcfileServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services!.web).toMatchObject({
        entrypoint: 'myapp/wsgi.py',
      });
    });

    it('should detect uvicorn with module:attr', async () => {
      const fs = new VirtualFilesystem({
        Procfile: 'web: uvicorn app.main:app --host 0.0.0.0 --port 8000',
        'requirements.txt': 'fastapi',
        'app/main.py': 'from fastapi import FastAPI',
      });

      const result = await detectProcfileServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services!.web).toMatchObject({
        type: 'web',
        framework: 'fastapi',
        entrypoint: 'app/main.py',
        routePrefix: '/',
      });
    });

    it('should detect uwsgi with --module flag', async () => {
      const fs = new VirtualFilesystem({
        Procfile: 'web: uwsgi --http :8000 --module myapp.wsgi:application',
        'requirements.txt': 'django',
        'manage.py': 'import django',
        'myapp/wsgi.py':
          'from django.core.wsgi import get_wsgi_application\napplication = get_wsgi_application()',
      });

      const result = await detectProcfileServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services!.web).toMatchObject({
        entrypoint: 'myapp/wsgi.py',
      });
    });

    it('should detect uwsgi with --wsgi-file flag', async () => {
      const fs = new VirtualFilesystem({
        Procfile: 'web: uwsgi --http :8000 --wsgi-file app.py',
        'requirements.txt': 'flask',
        'app.py': 'from flask import Flask\napp = Flask(__name__)',
      });

      const result = await detectProcfileServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services!.web).toMatchObject({
        entrypoint: 'app.py',
      });
    });
  });

  describe('node services', () => {
    it('should detect node with file argument', async () => {
      const fs = new VirtualFilesystem({
        Procfile: 'web: node server.js',
        'package.json': JSON.stringify({
          dependencies: { express: '4.0.0' },
        }),
        'server.js': 'const express = require("express")',
      });

      const result = await detectProcfileServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(result.services!.web).toMatchObject({
        type: 'web',
        entrypoint: 'server.js',
        routePrefix: '/',
      });
    });

    it('should detect tsx with file argument', async () => {
      const fs = new VirtualFilesystem({
        Procfile: 'web: tsx src/server.ts',
        'package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
      });

      const result = await detectProcfileServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services!.web).toMatchObject({
        type: 'web',
        entrypoint: 'src/server.ts',
        routePrefix: '/',
      });
    });

    it('should handle node --require correctly', async () => {
      const fs = new VirtualFilesystem({
        Procfile: 'web: node --require ./setup.js server.js',
        'package.json': JSON.stringify({
          dependencies: { express: '4.0.0' },
        }),
        'server.js': 'const express = require("express")',
      });

      const result = await detectProcfileServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services!.web).toMatchObject({
        entrypoint: 'server.js',
        routePrefix: '/',
      });
    });

    it('should handle node -r with shorthand flag', async () => {
      const fs = new VirtualFilesystem({
        Procfile: 'web: node -r dotenv/config server.js',
        'package.json': JSON.stringify({
          dependencies: { express: '4.0.0' },
        }),
        'server.js': 'const express = require("express")',
      });

      const result = await detectProcfileServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services!.web).toMatchObject({
        entrypoint: 'server.js',
        routePrefix: '/',
      });
    });
  });

  describe('release process', () => {
    it('should put release into web service buildCommand', async () => {
      const fs = new VirtualFilesystem({
        Procfile: [
          'web: gunicorn myapp.wsgi:app',
          'release: python manage.py migrate',
        ].join('\n'),
        'requirements.txt': 'django',
        'manage.py': 'import django',
        'myapp/wsgi.py':
          'from django.core.wsgi import get_wsgi_application\napplication = get_wsgi_application()',
      });

      const result = await detectProcfileServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services!.web).toMatchObject({
        type: 'web',
        entrypoint: 'myapp/wsgi.py',
        buildCommand: 'python manage.py migrate',
      });
    });

    it('should put release into first service when no "web" process', async () => {
      const fs = new VirtualFilesystem({
        Procfile: [
          'api: uvicorn api.main:app',
          'release: python manage.py migrate',
        ].join('\n'),
        'requirements.txt': 'fastapi',
        'api/main.py': 'from fastapi import FastAPI',
      });

      const result = await detectProcfileServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services!.api).toMatchObject({
        buildCommand: 'python manage.py migrate',
      });
    });

    it('should emit warning when only release process exists', async () => {
      const fs = new VirtualFilesystem({
        Procfile: 'release: python manage.py migrate',
      });

      const result = await detectProcfileServices({ fs });

      expect(result.services).toBeNull();
      const warning = result.warnings.find(
        w => w.code === 'PROCFILE_RELEASE_ONLY'
      );
      expect(warning).toBeDefined();
      expect(warning!.message).toContain('python manage.py migrate');
    });
  });

  describe('worker processes', () => {
    it('should create worker service for celery with entrypoint', async () => {
      const fs = new VirtualFilesystem({
        Procfile: [
          'web: gunicorn myapp.wsgi:app',
          'worker: celery -A myapp.celery worker --loglevel=info',
        ].join('\n'),
        'requirements.txt': 'django\ncelery',
        'manage.py': 'import django',
        'myapp/wsgi.py':
          'from django.core.wsgi import get_wsgi_application\napplication = get_wsgi_application()',
        'myapp/celery.py': 'import celery; app = celery.Celery("app")',
      });

      const result = await detectProcfileServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(Object.keys(result.services!).sort()).toEqual(['web', 'worker']);
      expect(result.services!.worker).toMatchObject({
        type: 'worker',
        entrypoint: 'myapp/celery.py',
        runtime: 'python',
      });
    });

    it('should create worker service for dramatiq with entrypoint', async () => {
      const fs = new VirtualFilesystem({
        Procfile: [
          'web: uvicorn app.main:app',
          'worker: dramatiq app.run',
        ].join('\n'),
        'requirements.txt': 'fastapi\ndramatiq',
        'app/main.py': 'from fastapi import FastAPI',
        'app/run.py': 'from worker import broker, tasks',
      });

      const result = await detectProcfileServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(Object.keys(result.services!)).toHaveLength(2);
      expect(result.services!.web).toMatchObject({
        type: 'web',
        framework: 'fastapi',
        entrypoint: 'app/main.py',
      });
      expect(result.services!.worker).toMatchObject({
        type: 'worker',
        entrypoint: 'app/run.py',
        runtime: 'python',
      });
    });

    it('should not let celery subcommand shadow the real entrypoint', async () => {
      const fs = new VirtualFilesystem({
        Procfile: [
          'web: gunicorn myapp.wsgi:app',
          'worker: celery -A myapp.celery worker --loglevel=info',
        ].join('\n'),
        'requirements.txt': 'django\ncelery',
        'manage.py': 'import django',
        'myapp/wsgi.py':
          'from django.core.wsgi import get_wsgi_application\napplication = get_wsgi_application()',
        'myapp/celery.py': 'from celery import Celery\napp = Celery("myapp")',
        // worker.py exists at root, bit it should not shadow myapp/celery.py that's used in the process
        'worker.py': 'from myapp.celery import app',
      });

      const result = await detectProcfileServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services!.worker).toMatchObject({
        type: 'worker',
        entrypoint: 'myapp/celery.py',
        runtime: 'python',
      });
    });

    it('should error on duplicate worker process types', async () => {
      const fs = new VirtualFilesystem({
        Procfile: [
          'web: gunicorn myapp.wsgi:app',
          'worker: celery -A app.tasks worker',
          'worker: celery -A app.emails worker',
        ].join('\n'),
        'requirements.txt': 'django\ncelery',
        'manage.py': 'import django',
        'myapp/wsgi.py':
          'from django.core.wsgi import get_wsgi_application\napplication = get_wsgi_application()',
        'app/tasks.py': 'from celery import Celery',
        'app/emails.py': 'from celery import Celery',
      });

      const result = await detectProcfileServices({ fs });

      expect(result.services).toBeNull();
      const dupError = result.errors.find(e => e.code === 'DUPLICATE_SERVICE');
      expect(dupError).toBeDefined();
      expect(dupError!.serviceName).toBe('worker');
    });

    it('should handle Python workers without web process', async () => {
      const fs = new VirtualFilesystem({
        Procfile: [
          'worker-a: celery -A myapp.tasks_a worker',
          'worker-b: celery -A myapp.tasks_b worker',
        ].join('\n'),
        'requirements.txt': 'celery',
        'myapp/tasks_a.py': 'from celery import Celery\napp = Celery("myapp")',
        'myapp/tasks_b.py': 'from celery import Celery\napp = Celery("myapp")',
      });

      const result = await detectProcfileServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(result.services!['worker-a']).toMatchObject({
        type: 'worker',
        entrypoint: 'myapp/tasks_a.py',
      });
      expect(result.services!['worker-b']).toMatchObject({
        type: 'worker',
        entrypoint: 'myapp/tasks_b.py',
      });
    });

    it('should emit worker hint for python worker.py', async () => {
      const fs = new VirtualFilesystem({
        Procfile: ['web: node server.js', 'worker: python worker.py'].join(
          '\n'
        ),
        'package.json': JSON.stringify({
          dependencies: { express: '4.0.0' },
        }),
        'server.js': 'const express = require("express")',
      });

      const result = await detectProcfileServices({ fs });

      expect(result.services).not.toBeNull();
      expect(result.services!.worker).toBeUndefined();

      const hint = result.warnings.find(w => w.code === 'PROCFILE_WORKER_HINT');
      expect(hint).toBeDefined();
      expect(hint!.message).toContain('"entrypoint": "worker.py"');
    });

    it('should emit hint for non-python worker', async () => {
      const fs = new VirtualFilesystem({
        Procfile: ['web: node server.js', 'worker: node worker.js'].join('\n'),
        'package.json': JSON.stringify({
          dependencies: { express: '4.0.0' },
        }),
        'server.js': 'const express = require("express")',
      });

      const result = await detectProcfileServices({ fs });

      const hint = result.warnings.find(w => w.code === 'PROCFILE_WORKER_HINT');
      expect(hint).toBeDefined();
      expect(hint!.message).toContain('Only Python workers');
    });

    it('should recognize worker-like names (e.g., bg-worker)', async () => {
      const fs = new VirtualFilesystem({
        Procfile: [
          'web: gunicorn myapp.wsgi:app',
          'bg-worker: celery -A tasks worker',
        ].join('\n'),
        'requirements.txt': 'django\ncelery',
        'manage.py': 'import django',
        'myapp/wsgi.py':
          'from django.core.wsgi import get_wsgi_application\napplication = get_wsgi_application()',
      });

      const result = await detectProcfileServices({ fs });

      const hint = result.warnings.find(w => w.code === 'PROCFILE_WORKER_HINT');
      expect(hint).toBeDefined();
      expect(hint!.message).toContain('bg-worker');
    });
  });

  describe('custom process names as web services', () => {
    it('should infer api process running uvicorn as web service', async () => {
      const fs = new VirtualFilesystem({
        Procfile: [
          'web: gunicorn myapp.wsgi:app',
          'api: uvicorn api.main:app --port 8001',
        ].join('\n'),
        'requirements.txt': 'django',
        'manage.py': 'import django',
        'myapp/wsgi.py':
          'from django.core.wsgi import get_wsgi_application\napplication = get_wsgi_application()',
        'api/main.py': 'from fastapi import FastAPI\napp = FastAPI()',
      });

      const result = await detectProcfileServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(Object.keys(result.services!)).toHaveLength(2);
      expect(result.services!.web).toMatchObject({
        type: 'web',
        framework: 'django',
        entrypoint: 'myapp/wsgi.py',
      });
      expect(result.services!.api).toMatchObject({
        type: 'web',
        entrypoint: 'api/main.py',
      });
    });

    it('should infer custom name running node as web service', async () => {
      const fs = new VirtualFilesystem({
        Procfile: 'backend: node server.js',
        'package.json': JSON.stringify({
          dependencies: { express: '4.0.0' },
        }),
        'server.js': 'const express = require("express")',
      });

      const result = await detectProcfileServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services!.backend).toMatchObject({
        type: 'web',
        entrypoint: 'server.js',
        routePrefix: '/',
      });
    });
  });

  describe('edge cases', () => {
    it('should return null when no Procfile exists', async () => {
      const fs = new VirtualFilesystem({
        'package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
      });

      const result = await detectProcfileServices({ fs });

      expect(result.services).toBeNull();
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should return null for empty Procfile', async () => {
      const fs = new VirtualFilesystem({
        Procfile: '',
      });

      const result = await detectProcfileServices({ fs });

      expect(result.services).toBeNull();
    });

    it('should return null for comment-only Procfile', async () => {
      const fs = new VirtualFilesystem({
        Procfile: '# This is a comment\n# Another comment',
      });

      const result = await detectProcfileServices({ fs });

      expect(result.services).toBeNull();
    });

    it('should skip lines without colon', async () => {
      const fs = new VirtualFilesystem({
        Procfile: 'this is not valid\nweb: node server.js',
        'package.json': JSON.stringify({
          dependencies: { express: '4.0.0' },
        }),
        'server.js': 'const express = require("express")',
      });

      const result = await detectProcfileServices({ fs });

      expect(result.services).not.toBeNull();
      expect(result.services!.web).toBeDefined();
    });

    it('should error on duplicate process types', async () => {
      const fs = new VirtualFilesystem({
        Procfile: 'web: node server.js\nweb: node app.js',
        'package.json': JSON.stringify({
          dependencies: { express: '4.0.0' },
        }),
        'server.js': 'const express = require("express")',
        'app.js': 'const express = require("express")',
      });

      const result = await detectProcfileServices({ fs });

      expect(result.services).toBeNull();
      const dupError = result.errors.find(e => e.code === 'DUPLICATE_SERVICE');
      expect(dupError).toBeDefined();
    });

    it('should handle multiple services with correct route prefixes', async () => {
      const fs = new VirtualFilesystem({
        Procfile: [
          'web: gunicorn myapp.wsgi:app',
          'api: uvicorn api.main:app',
        ].join('\n'),
        'requirements.txt': 'django',
        'manage.py': 'import django',
        'myapp/wsgi.py':
          'from django.core.wsgi import get_wsgi_application\napplication = get_wsgi_application()',
        'api/main.py': 'from fastapi import FastAPI\napp = FastAPI()',
      });

      const result = await detectProcfileServices({ fs });

      expect(result.errors).toEqual([]);
      // both are backend frameworks, no frontend detected,
      // so all get /_/<name> prefixes
      expect(result.services!.web.routePrefix).toBe('/_/web');
      expect(result.services!.api.routePrefix).toBe('/_/api');
    });

    it('should skip service when no framework detected and no runtime inferred', async () => {
      const fs = new VirtualFilesystem({
        Procfile: 'web: ./start.sh',
      });

      const result = await detectProcfileServices({ fs });

      expect(result.services).toBeNull();
      const warning = result.warnings.find(w => w.code === 'SERVICE_SKIPPED');
      expect(warning).toBeDefined();
    });

    it('should error when multiple frameworks detected', async () => {
      const fs = new VirtualFilesystem({
        Procfile: 'web: node server.js',
        'package.json': JSON.stringify({
          dependencies: { next: '14.0.0' },
        }),
        'server.js': 'const next = require("next")',
        'requirements.txt': 'fastapi',
        'main.py': 'from fastapi import FastAPI\napp = FastAPI()',
      });

      const result = await detectProcfileServices({ fs });

      expect(result.services).toBeNull();
      const error = result.errors.find(
        e => e.code === 'MULTIPLE_FRAMEWORKS_SERVICE'
      );
      expect(error).toBeDefined();
      expect(error!.message).toContain('Multiple frameworks detected');
    });
  });

  describe('combined scenarios', () => {
    it('should handle web + worker + release together', async () => {
      const fs = new VirtualFilesystem({
        Procfile: [
          'web: gunicorn myapp.wsgi:app',
          'worker: celery -A myapp.celery worker',
          'release: python manage.py migrate',
        ].join('\n'),
        'requirements.txt': 'django\ncelery',
        'manage.py': 'import django',
        'myapp/wsgi.py':
          'from django.core.wsgi import get_wsgi_application\napplication = get_wsgi_application()',
        'myapp/celery.py': 'from celery import Celery\napp = Celery("myapp")',
      });

      const result = await detectProcfileServices({ fs });

      expect(result.errors).toEqual([]);
      expect(result.services).not.toBeNull();
      expect(Object.keys(result.services!)).toHaveLength(2);
      expect(result.services!.web).toMatchObject({
        type: 'web',
        framework: 'django',
        entrypoint: 'myapp/wsgi.py',
        buildCommand: 'python manage.py migrate',
      });
      expect(result.services!.worker).toMatchObject({
        type: 'worker',
        entrypoint: 'myapp/celery.py',
        runtime: 'python',
      });
    });
  });
});

describe('detectServices with Procfile detection', () => {
  it('should detect Procfile services and return as inferred', async () => {
    const fs = new VirtualFilesystem({
      Procfile: 'web: gunicorn myapp.wsgi:app',
      'requirements.txt': 'django',
      'manage.py': 'import django',
      'myapp/wsgi.py': 'application = get_wsgi_application()',
    });

    const result = await detectServices({ fs });

    expect(result.errors).toEqual([]);
    expect(result.source).toBe('auto-detected');
    expect(result.services).toHaveLength(0);
    expect(result.inferred).not.toBeNull();
    expect(result.inferred!.source).toBe('procfile');
    expect(result.inferred!.services).toHaveLength(1);
  });
});
