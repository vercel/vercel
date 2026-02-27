import { expect, test } from 'vitest';
import { readdirSync } from 'node:fs';
import { promisify } from 'node:util';
import { exec } from 'node:child_process';

test('creates a project by the name of the fixture folder', async () => {
  const output = readdirSync('.');
  const fixtureFolder = output.find(o => o.startsWith('fixture'));
  const projectInfo = await promisify(exec)(
    `vc project inspect ${fixtureFolder} --scope=agentic-zero-conf`
  );
  expect(projectInfo).toContain('Hono');
  expect(projectInfo).toContain(fixtureFolder);
  const deploymentInfo = await promisify(exec)(
    `vc list ${fixtureFolder} --scope=agentic-zero-conf`
  );
  expect(deploymentInfo).toContain('Ready');
});
