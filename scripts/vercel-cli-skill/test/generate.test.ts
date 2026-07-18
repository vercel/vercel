import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { loadCommandModel, visibleCommands } from '../load-command-model.js';
import { assertGeneratedContentSafe, renderIndex } from '../render-markdown.js';
import { GENERATED_INDEX, generateSkillReference } from '../generate.js';
import { repoRoot } from '../paths.js';

describe('generate from real CLI metadata', () => {
  test('is deterministic and covers every visible root family once', async () => {
    const manifest = await loadCommandModel();
    const first = renderIndex(manifest);
    const second = renderIndex(manifest);
    expect(first).toBe(second);

    assertGeneratedContentSafe(first, [repoRoot]);
    expect(first.includes(repoRoot)).toBe(false);

    const visible = visibleCommands(manifest.commands);
    const counts = new Map<string, number>();
    for (const command of manifest.commands) {
      counts.set(
        command.canonicalPath,
        (counts.get(command.canonicalPath) ?? 0) + 1
      );
    }
    for (const command of visible) {
      expect(counts.get(command.canonicalPath)).toBe(1);
    }

    // Every visible root family appears exactly once in the command map.
    for (const root of visible.filter(c => c.path.length === 1)) {
      const row = `| \`${root.name}\` |`;
      expect(
        first.split('\n').filter(line => line.startsWith(row)),
        root.name
      ).toHaveLength(1);
    }
  });

  test('generateSkillReference writes only index.md, identically twice', async () => {
    const dir1 = await mkdtemp(join(tmpdir(), 'vercel-cli-skill-a-'));
    const dir2 = await mkdtemp(join(tmpdir(), 'vercel-cli-skill-b-'));
    try {
      await generateSkillReference(dir1);
      await generateSkillReference(dir2);
      expect(await readdir(dir1)).toEqual([GENERATED_INDEX]);
      const a = await readFile(join(dir1, GENERATED_INDEX), 'utf8');
      const b = await readFile(join(dir2, GENERATED_INDEX), 'utf8');
      expect(a).toBe(b);
    } finally {
      await rm(dir1, { recursive: true, force: true });
      await rm(dir2, { recursive: true, force: true });
    }
  });

  test('assertGeneratedContentSafe rejects generator timestamps and absolute paths', () => {
    expect(() =>
      assertGeneratedContentSafe('Generated at 2026-07-17T12:00:00.000Z', [])
    ).toThrow(/generator timestamp/);

    expect(() =>
      assertGeneratedContentSafe(
        '{ "generatedAt": "2026-07-17T12:00:00.000Z" }',
        []
      )
    ).toThrow(/generator timestamp/);

    expect(() =>
      assertGeneratedContentSafe(`path ${repoRoot} leaked`, [repoRoot])
    ).toThrow(/forbidden path/);
  });
});
