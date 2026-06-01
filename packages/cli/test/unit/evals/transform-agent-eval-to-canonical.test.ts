import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  chunkEvalFilesByEstimatedRequestSize,
  getEvalGroup,
  getRunGroup,
  isResultsFile,
  normalizeUploadPath,
  packFilesIntoChunks,
  parseMaxRequestBytes,
  splitAtTimestamp,
} from '../../../evals/scripts/transform-agent-eval-to-canonical.js';

const TIMESTAMP = '2026-01-01T00-00-00Z';

describe('parseMaxRequestBytes', () => {
  it('falls back to the default when nothing is provided', () => {
    expect(parseMaxRequestBytes(undefined)).toBe(3_500_000);
    expect(parseMaxRequestBytes('')).toBe(3_500_000);
  });

  it('parses and floors a positive number', () => {
    expect(parseMaxRequestBytes('1000')).toBe(1000);
    expect(parseMaxRequestBytes('1000.9')).toBe(1000);
  });

  it('throws on non-numeric or non-positive input', () => {
    expect(() => parseMaxRequestBytes('abc')).toThrow();
    expect(() => parseMaxRequestBytes('0')).toThrow();
    expect(() => parseMaxRequestBytes('-5')).toThrow();
  });
});

describe('splitAtTimestamp', () => {
  it('locates the timestamp segment', () => {
    expect(
      splitAtTimestamp(`exp/m/${TIMESTAMP}/_deploy/run-1/result.json`)
    ).toEqual({
      segments: ['exp', 'm', TIMESTAMP, '_deploy', 'run-1', 'result.json'],
      timestampIndex: 2,
    });
  });

  it('reports -1 when there is no timestamp', () => {
    expect(splitAtTimestamp('no/timestamp/here').timestampIndex).toBe(-1);
  });
});

describe('normalizeUploadPath', () => {
  it('leaves a single-segment model unchanged', () => {
    const p = `exp/model/${TIMESTAMP}/_deploy/run-1/result.json`;
    expect(normalizeUploadPath(p)).toBe(p);
  });

  it('leaves a path without a model segment unchanged', () => {
    const p = `exp/${TIMESTAMP}/_deploy/run-1/result.json`;
    expect(normalizeUploadPath(p)).toBe(p);
  });

  it('collapses a multi-segment model into one dashed segment', () => {
    expect(
      normalizeUploadPath(
        `exp/openai/gpt-5.5/${TIMESTAMP}/_deploy/run-1/x.json`
      )
    ).toBe(`exp/openai-gpt-5.5/${TIMESTAMP}/_deploy/run-1/x.json`);
  });
});

describe('getRunGroup', () => {
  it('groups by experiment/model/timestamp', () => {
    expect(getRunGroup(`exp/m/${TIMESTAMP}/_deploy/run-1/result.json`)).toBe(
      `exp/m/${TIMESTAMP}`
    );
  });

  it('returns ungrouped without a timestamp', () => {
    expect(getRunGroup('no/timestamp')).toBe('ungrouped');
  });
});

describe('getEvalGroup', () => {
  it('merges all runs of the same eval into one group', () => {
    expect(getEvalGroup(`exp/m/${TIMESTAMP}/_deploy/run-1/result.json`)).toBe(
      `exp/m/${TIMESTAMP}/_deploy`
    );
    expect(getEvalGroup(`exp/m/${TIMESTAMP}/_deploy/run-2/result.json`)).toBe(
      `exp/m/${TIMESTAMP}/_deploy`
    );
  });

  it('keeps different evals in different groups', () => {
    expect(getEvalGroup(`exp/m/${TIMESTAMP}/build/run-1/result.json`)).toBe(
      `exp/m/${TIMESTAMP}/build`
    );
  });
});

describe('isResultsFile', () => {
  it('matches summary.json and run-N/result.json', () => {
    expect(isResultsFile(`exp/m/${TIMESTAMP}/_deploy/run-1/result.json`)).toBe(
      true
    );
    expect(isResultsFile(`exp/m/${TIMESTAMP}/_deploy/summary.json`)).toBe(true);
  });

  it('does not match artifacts', () => {
    expect(
      isResultsFile(`exp/m/${TIMESTAMP}/_deploy/run-1/outputs/a.txt`)
    ).toBe(false);
    expect(
      isResultsFile(`exp/m/${TIMESTAMP}/_deploy/run-1/transcript.json`)
    ).toBe(false);
  });
});

describe('chunking', () => {
  let resultsDir: string;

  async function writeFixture(relPath: string, content = '{}') {
    const full = path.join(resultsDir, relPath);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content);
    return full;
  }

  beforeEach(async () => {
    resultsDir = await mkdtemp(path.join(os.tmpdir(), 'eval-transform-'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(resultsDir, { recursive: true, force: true });
  });

  it('returns a single chunk when everything fits', async () => {
    const base = `exp/model/${TIMESTAMP}/_deploy/run-1`;
    const files = [
      await writeFixture(`${base}/result.json`),
      await writeFixture(`${base}/summary.json`),
      await writeFixture(`${base}/outputs/a.txt`, 'a'.repeat(500)),
      await writeFixture(`${base}/outputs/b.txt`, 'b'.repeat(500)),
    ];

    const chunks = await chunkEvalFilesByEstimatedRequestSize({
      files,
      resultsDir,
      payload: {},
      maxRequestBytes: 10_000_000,
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual(expect.arrayContaining(files));
    expect(chunks[0]).toHaveLength(4);
  });

  it('seeds results files into every chunk when splitting', async () => {
    const base = `exp/model/${TIMESTAMP}/_deploy/run-1`;
    const result = await writeFixture(`${base}/result.json`);
    const summary = await writeFixture(`${base}/summary.json`);
    const a = await writeFixture(`${base}/outputs/a.txt`, 'a'.repeat(500));
    const b = await writeFixture(`${base}/outputs/b.txt`, 'b'.repeat(500));

    const chunks = await chunkEvalFilesByEstimatedRequestSize({
      files: [result, summary, a, b],
      resultsDir,
      payload: {},
      maxRequestBytes: 1,
    });

    expect(chunks).toHaveLength(2);
    for (const chunk of chunks) {
      expect(chunk).toContain(result);
      expect(chunk).toContain(summary);
    }
    const artifacts = chunks.flat().filter(f => f === a || f === b);
    expect(artifacts).toHaveLength(2);
    expect(new Set(artifacts)).toEqual(new Set([a, b]));
  });

  it('falls back to plain size packing when there are no results files', async () => {
    const base = `exp/model/${TIMESTAMP}/_deploy/run-1`;
    const a = await writeFixture(`${base}/outputs/a.txt`, 'a'.repeat(500));
    const b = await writeFixture(`${base}/outputs/b.txt`, 'b'.repeat(500));

    const chunks = await chunkEvalFilesByEstimatedRequestSize({
      files: [a, b],
      resultsDir,
      payload: {},
      maxRequestBytes: 1,
    });

    expect(chunks).toHaveLength(2);
    for (const chunk of chunks) {
      expect(chunk).toHaveLength(1);
    }
    expect(new Set(chunks.flat())).toEqual(new Set([a, b]));
  });

  it('packFilesIntoChunks keeps the seed in each chunk and never splits the seed alone', async () => {
    const base = `exp/model/${TIMESTAMP}/_deploy/run-1`;
    const seed = [await writeFixture(`${base}/result.json`)];
    const a = await writeFixture(`${base}/outputs/a.txt`, 'a'.repeat(500));
    const b = await writeFixture(`${base}/outputs/b.txt`, 'b'.repeat(500));

    const chunks = await packFilesIntoChunks({
      files: [a, b],
      resultsDir,
      seedFiles: seed,
      baseBytes: 0,
      maxRequestBytes: 1,
    });

    expect(chunks).toHaveLength(2);
    for (const chunk of chunks) {
      expect(chunk).toContain(seed[0]);
      expect(chunk.length).toBeGreaterThan(seed.length);
    }
  });
});
