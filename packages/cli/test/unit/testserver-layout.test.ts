import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

// Mirrors vercel/front test/playwright-layout.test.ts. Testserver tests live in
// test/testserver/commands/<name>/<action>.test.ts, matching
// test/unit/commands/<name>/.

const cliRoot = resolve(__dirname, '../..');
const testserverRoot = join(cliRoot, 'test', 'testserver');

function findTestFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.results') continue;
      files.push(...findTestFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      files.push(full);
    }
  }
  return files;
}

describe('testserver layout', () => {
  test('every test file is under commands/<name>/', () => {
    const files = findTestFiles(testserverRoot).map(f =>
      relative(testserverRoot, f).split(/[\\/]/).join('/')
    );
    expect(files.length).toBeGreaterThan(0);
    const misplaced = files.filter(
      f => !/^commands\/[^/]+\/[^/]+\.test\.ts$/.test(f)
    );
    expect(
      misplaced,
      'Testserver tests must live in test/testserver/commands/<name>/<action>.test.ts'
    ).toEqual([]);
  });

  test('the default vitest config excludes the testserver lane', () => {
    const config = readFileSync(join(cliRoot, 'vitest.config.mts'), 'utf8');
    expect(config).toContain("'test/testserver/**'");
  });
});
