import { describe, it, expect, beforeEach } from 'vitest';
import { dirname, join } from 'path';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { client } from '../../../mocks/client';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import { promptExperimentalServicesMigration } from '../../../../src/util/services/migrate-experimental-services';

const legacy = {
  experimentalServices: {
    frontend: { entrypoint: 'web', framework: 'nextjs', routePrefix: '/' },
    api: { entrypoint: 'api/main.py', routePrefix: '/api' },
  },
};
const migrated = {
  services: {
    frontend: {
      root: 'web',
      framework: 'nextjs',
      bindings: [
        { type: 'service', service: 'api', format: 'url', env: 'API_URL' },
      ],
    },
    api: {
      root: 'api',
      entrypoint: 'main.py',
      rewrites: [{ source: '/api/:path(.*)?', destination: '/:path' }],
      bindings: [
        {
          type: 'service',
          service: 'frontend',
          format: 'url',
          env: 'FRONTEND_URL',
        },
      ],
    },
  },
  rewrites: [
    { source: '/api(/.*)?', destination: { service: 'api' } },
    { source: '/(.*)', destination: { service: 'frontend' } },
  ],
  build: {
    env: { NEXT_PUBLIC_FRONTEND_URL: '/', NEXT_PUBLIC_API_URL: '/api' },
  },
};
const existing = {
  rewrites: [{ source: '/old', destination: '/new' }],
  env: { RUNTIME_ONLY: 'keep' },
  build: {
    env: { NEXT_PUBLIC_API_URL: '', BUILD_ONLY: 'keep' },
    custom: 'keep',
  },
};

describe('services migration', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = setupTmpDir();
    client.stdin.isTTY = false;
    for (const [name, content] of Object.entries({
      'web/package.json': JSON.stringify({ dependencies: { next: '15.0.0' } }),
      'api/main.py': 'app = None',
      'api/jobs.py': 'def run(): pass',
      'api/requirements.txt': 'fastapi',
    })) {
      const path = join(cwd, name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content);
    }
  });

  it.each([
    { name: 'frontend and backend', input: legacy, expected: migrated },
    {
      name: 'existing settings and env values',
      input: { ...legacy, ...existing, framework: 'services' },
      expected: {
        ...migrated,
        ...existing,
        rewrites: [...existing.rewrites, ...migrated.rewrites],
        build: {
          ...existing.build,
          env: { ...migrated.build.env, ...existing.build.env },
        },
      },
    },
    {
      name: 'deprecated V2 alias',
      input: {
        experimentalServicesV2: migrated.services,
        rewrites: migrated.rewrites,
      },
      expected: { services: migrated.services, rewrites: migrated.rewrites },
    },
    {
      name: 'dropped worker and renamed web service',
      input: {
        experimentalServices: {
          frontend: legacy.experimentalServices.frontend,
          Api: legacy.experimentalServices.api,
          api: {
            type: 'worker',
            entrypoint: 'api/jobs.py',
            topics: ['events'],
          },
        },
      },
      expected: migrated,
    },
  ])('$name', async ({ input, expected }) => {
    const path = join(cwd, 'vercel.json');
    await writeFile(path, JSON.stringify(input));
    expect(
      await promptExperimentalServicesMigration({
        client,
        cwd,
        autoConfirm: true,
        allowConfigExecution: false,
      })
    ).toBe(true);
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(expected);
  });

  it('does not write without approval', async () => {
    const path = join(cwd, 'vercel.json');
    const original = JSON.stringify(legacy);
    await writeFile(path, original);
    expect(
      await promptExperimentalServicesMigration({
        client,
        cwd,
        nonInteractive: true,
      })
    ).toBe(false);
    expect(await readFile(path, 'utf8')).toBe(original);
  });

  it.each([
    'ts',
    'mts',
    'js',
    'mjs',
    'cjs',
  ])('does not execute vercel.%s during data-only discovery, even with approval', async extension => {
    const marker = join(cwd, 'config-executed');
    const source = `
        ${extension === 'cjs' ? "const { writeFileSync } = require('node:fs');" : "import { writeFileSync } from 'node:fs';"}
        writeFileSync(${JSON.stringify(marker)}, 'executed');
        ${extension === 'cjs' ? 'module.exports =' : 'export default'} ${JSON.stringify(legacy)};
      `;
    const path = join(cwd, `vercel.${extension}`);
    await writeFile(path, source);
    expect(
      await promptExperimentalServicesMigration({
        client,
        cwd,
        autoConfirm: true,
        allowConfigExecution: false,
      })
    ).toBe(false);
    await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(path, 'utf8')).toBe(source);
  });

  it.each([
    { mode: 'data-only', allowConfigExecution: false, executed: false },
    { mode: 'default', allowConfigExecution: undefined, executed: true },
  ])('handles executable config without legacy services in $mode mode', async ({
    allowConfigExecution,
    executed,
  }) => {
    const marker = join(cwd, 'config-executed');
    await writeFile(
      join(cwd, 'vercel.js'),
      `import { writeFileSync } from 'node:fs';
       writeFileSync(${JSON.stringify(marker)}, 'executed');
       export default {};`
    );
    expect(
      await promptExperimentalServicesMigration({
        client,
        cwd,
        nonInteractive: true,
        allowConfigExecution,
      })
    ).toBe(false);
    if (executed) {
      expect(await readFile(marker, 'utf8')).toBe('executed');
    } else {
      await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' });
    }
  });

  it.each([
    {
      name: 'conflicting configuration',
      file: 'vercel.json',
      content: JSON.stringify({ ...legacy, services: migrated.services }),
    },
    {
      name: 'non-JSON configuration',
      file: 'vercel.toml',
      content:
        '[experimentalServices.api]\nentrypoint = "api/main.py"\nroutePrefix = "/"\n',
    },
  ])('does not write $name, even with approval', async ({ file, content }) => {
    const path = join(cwd, file);
    await writeFile(path, content);
    expect(
      await promptExperimentalServicesMigration({
        client,
        cwd,
        autoConfirm: true,
        allowConfigExecution: false,
      })
    ).toBe(false);
    expect(await readFile(path, 'utf8')).toBe(content);
  });
});
