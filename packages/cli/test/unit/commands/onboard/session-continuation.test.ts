import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { waitForTranscriptSettle } from '../../../../src/commands/onboard/session-continuation';

describe('waitForTranscriptSettle', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'onboard-transcripts-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns quickly once the store is quiet', async () => {
    await writeFile(join(dir, 'session.jsonl'), '{"type":"user"}\n');

    const started = Date.now();
    await waitForTranscriptSettle({
      harnessId: 'claude-code',
      workspace: '/tmp/anywhere',
      transcriptDir: dir,
      timeoutMs: 4000,
    });

    // One comparison interval, not the whole timeout.
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('waits for an in-flight write to stop before returning', async () => {
    const path = join(dir, 'session.jsonl');
    await writeFile(path, 'line\n');

    // Keep the file growing for a moment, like a turn being flushed.
    let contents = 'line\n';
    const writer = setInterval(() => {
      contents += 'line\n';
      void writeFile(path, contents);
    }, 100);
    setTimeout(() => clearInterval(writer), 700);

    const started = Date.now();
    await waitForTranscriptSettle({
      harnessId: 'claude-code',
      workspace: '/tmp/anywhere',
      transcriptDir: dir,
      timeoutMs: 5000,
    });

    expect(Date.now() - started).toBeGreaterThanOrEqual(700);
  });

  it('gives up at the timeout rather than blocking the hand-off', async () => {
    const path = join(dir, 'session.jsonl');
    await writeFile(path, 'line\n');
    let contents = 'line\n';
    const writer = setInterval(() => {
      contents += 'line\n';
      void writeFile(path, contents);
    }, 100);

    try {
      const started = Date.now();
      await waitForTranscriptSettle({
        harnessId: 'claude-code',
        workspace: '/tmp/anywhere',
        transcriptDir: dir,
        timeoutMs: 1200,
      });
      expect(Date.now() - started).toBeLessThan(3000);
    } finally {
      clearInterval(writer);
    }
  });

  it('returns immediately when the store does not exist', async () => {
    const started = Date.now();
    await waitForTranscriptSettle({
      harnessId: 'claude-code',
      workspace: '/tmp/anywhere',
      transcriptDir: join(dir, 'missing'),
      timeoutMs: 4000,
    });
    expect(Date.now() - started).toBeLessThan(300);
  });

  it('is a no-op for harnesses without a known transcript store', async () => {
    const started = Date.now();
    await waitForTranscriptSettle({
      harnessId: 'codex',
      workspace: '/tmp/anywhere',
      transcriptDir: dir,
      timeoutMs: 4000,
    });
    expect(Date.now() - started).toBeLessThan(300);
  });
});
