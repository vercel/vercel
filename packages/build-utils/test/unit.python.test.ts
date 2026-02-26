import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { tmpdir } from 'os';
import { getProcfileWebEntrypoint } from '../src';

describe('Procfile web entrypoint discovery', () => {
  async function writeFiles(
    workPath: string,
    files: Record<string, string>
  ): Promise<void> {
    for (const [rel, content] of Object.entries(files)) {
      const full = path.join(workPath, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
  }

  it('resolves Procfile entrypoint (web: gunicorn module:attr)', async () => {
    const workPath = path.join(
      tmpdir(),
      `python-django-procfile-${Date.now()}`
    );
    fs.mkdirSync(workPath, { recursive: true });

    await writeFiles(workPath, {
      Procfile: 'web: gunicorn myapp.wsgi:application',
    });

    const result = await getProcfileWebEntrypoint(workPath);
    expect(result).toBe('myapp/wsgi.py');

    if (fs.existsSync(workPath)) fs.removeSync(workPath);
  });

  it('resolves Procfile entrypoint (web: gunicorn module only)', async () => {
    const workPath = path.join(
      tmpdir(),
      `python-django-procfile-module-${Date.now()}`
    );
    fs.mkdirSync(workPath, { recursive: true });

    await writeFiles(workPath, {
      Procfile: 'web: gunicorn project.wsgi',
    });

    const result = await getProcfileWebEntrypoint(workPath);
    expect(result).toBe('project/wsgi.py');

    if (fs.existsSync(workPath)) fs.removeSync(workPath);
  });

  it('resolves Procfile entrypoint (web: gunicorn -c myconf.py myapp.wsgi)', async () => {
    const workPath = path.join(
      tmpdir(),
      `python-django-procfile-gunicorn-config-${Date.now()}`
    );
    fs.mkdirSync(workPath, { recursive: true });

    await writeFiles(workPath, {
      Procfile: 'web: gunicorn -c myconf.py myapp.wsgi',
    });

    const result = await getProcfileWebEntrypoint(workPath);
    expect(result).toBe('myapp/wsgi.py');

    if (fs.existsSync(workPath)) fs.removeSync(workPath);
  });

  it('resolves Procfile entrypoint (web: gunicorn -c config, wsgi_app in config)', async () => {
    const workPath = path.join(
      tmpdir(),
      `python-django-procfile-gunicorn-wsgi-app-${Date.now()}`
    );
    fs.mkdirSync(workPath, { recursive: true });

    await writeFiles(workPath, {
      Procfile: 'web: gunicorn -c gunicorn.conf.py',
      'gunicorn.conf.py': 'wsgi_app = "myproject.wsgi:application"',
    });

    const result = await getProcfileWebEntrypoint(workPath);
    expect(result).toBe('myproject/wsgi.py');

    if (fs.existsSync(workPath)) fs.removeSync(workPath);
  });

  it('resolves Procfile entrypoint (web: gunicorn, default config gunicorn.conf.py with wsgi_app)', async () => {
    const workPath = path.join(
      tmpdir(),
      `python-django-procfile-gunicorn-default-config-${Date.now()}`
    );
    fs.mkdirSync(workPath, { recursive: true });

    await writeFiles(workPath, {
      Procfile: 'web: gunicorn',
      'gunicorn.conf.py': 'wsgi_app = "myproject.wsgi:application"',
    });

    const result = await getProcfileWebEntrypoint(workPath);
    expect(result).toBe('myproject/wsgi.py');

    if (fs.existsSync(workPath)) fs.removeSync(workPath);
  });

  it('resolves Procfile entrypoint (web: gunicorn -c config with app on command line; command line takes precedence)', async () => {
    const workPath = path.join(
      tmpdir(),
      `python-django-procfile-gunicorn-cmdline-precedence-${Date.now()}`
    );
    fs.mkdirSync(workPath, { recursive: true });

    await writeFiles(workPath, {
      Procfile: 'web: gunicorn -c gunicorn.conf.py myapp.wsgi',
      'gunicorn.conf.py': 'wsgi_app = "other.wsgi:application"',
    });

    const result = await getProcfileWebEntrypoint(workPath);
    expect(result).toBe('myapp/wsgi.py');

    if (fs.existsSync(workPath)) fs.removeSync(workPath);
  });

  it('resolves Procfile entrypoint (web: uvicorn module:attr)', async () => {
    const workPath = path.join(
      tmpdir(),
      `python-django-procfile-uvicorn-${Date.now()}`
    );
    fs.mkdirSync(workPath, { recursive: true });

    await writeFiles(workPath, {
      Procfile: 'web: uvicorn myproject.asgi:application',
    });

    const result = await getProcfileWebEntrypoint(workPath);
    expect(result).toBe('myproject/asgi.py');

    if (fs.existsSync(workPath)) fs.removeSync(workPath);
  });

  it('resolves Procfile entrypoint (web: uvicorn module only)', async () => {
    const workPath = path.join(
      tmpdir(),
      `python-django-procfile-uvicorn-module-${Date.now()}`
    );
    fs.mkdirSync(workPath, { recursive: true });

    await writeFiles(workPath, {
      Procfile: 'web: uvicorn app.asgi',
    });

    const result = await getProcfileWebEntrypoint(workPath);
    expect(result).toBe('app/asgi.py');

    if (fs.existsSync(workPath)) fs.removeSync(workPath);
  });

  it('resolves Procfile entrypoint (web: uwsgi .ini)', async () => {
    const workPath = path.join(
      tmpdir(),
      `python-django-procfile-uwsgi-${Date.now()}`
    );
    fs.mkdirSync(workPath, { recursive: true });

    await writeFiles(workPath, {
      Procfile: 'web: uwsgi uwsgi.ini',
      'uwsgi.ini': '[uwsgi]\nmodule = myproject.wsgi:application\n',
    });

    const result = await getProcfileWebEntrypoint(workPath);
    expect(result).toBe('myproject/wsgi.py');

    if (fs.existsSync(workPath)) fs.removeSync(workPath);
  });

  it('returns path from Procfile even when file does not exist on disk', async () => {
    const workPath = path.join(
      tmpdir(),
      `python-django-procfile-skip-${Date.now()}`
    );
    fs.mkdirSync(workPath, { recursive: true });

    await writeFiles(workPath, {
      Procfile: 'web: gunicorn nonexistent.wsgi:application',
    });

    const result = await getProcfileWebEntrypoint(workPath);
    expect(result).toBe('nonexistent/wsgi.py');

    if (fs.existsSync(workPath)) fs.removeSync(workPath);
  });

  it('returns null when Procfile has no web process line', async () => {
    const workPath = path.join(
      tmpdir(),
      `python-django-procfile-no-web-${Date.now()}`
    );
    fs.mkdirSync(workPath, { recursive: true });

    await writeFiles(workPath, {
      Procfile: 'worker: python worker.py\nrelease: python migrate.py',
    });

    const result = await getProcfileWebEntrypoint(workPath);
    expect(result).toBeNull();

    if (fs.existsSync(workPath)) fs.removeSync(workPath);
  });
});
