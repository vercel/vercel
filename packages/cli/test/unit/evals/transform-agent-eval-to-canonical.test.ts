import { describe, expect, it } from 'vitest';
import {
  isRawTranscriptFile,
  normalizeUploadPath,
  shouldUploadFile,
} from '../../../evals/scripts/transform-agent-eval-to-canonical.js';

const TIMESTAMP = '2026-01-01T00-00-00Z';
const RUN = `exp/m/${TIMESTAMP}/_deploy/run-1`;

describe('isRawTranscriptFile', () => {
  it('matches raw transcripts inside a run directory', () => {
    expect(isRawTranscriptFile(`${RUN}/transcript-raw.jsonl`)).toBe(true);
  });

  it('does not match the parsed transcript or other artifacts', () => {
    expect(isRawTranscriptFile(`${RUN}/transcript.json`)).toBe(false);
    expect(isRawTranscriptFile(`${RUN}/result.json`)).toBe(false);
  });
});

describe('normalizeUploadPath', () => {
  it('collapses a provider-prefixed model into one segment so the timestamp stays at depth 2', () => {
    expect(
      normalizeUploadPath(
        `cli-gpt-5.5-pro/openai/gpt-5.5-pro/${TIMESTAMP}/init/run-1/result.json`
      )
    ).toBe(
      `cli-gpt-5.5-pro/openai-gpt-5.5-pro/${TIMESTAMP}/init/run-1/result.json`
    );
  });

  it('leaves a single-segment model path unchanged', () => {
    const p = `cli-gpt-5.4-medium/gpt-5.4?reasoningEffort=medium/${TIMESTAMP}/init/run-1/result.json`;
    expect(normalizeUploadPath(p)).toBe(p);
  });

  it('leaves a path with no model segment unchanged', () => {
    const p = `cli/${TIMESTAMP}/_deploy/run-1/result.json`;
    expect(normalizeUploadPath(p)).toBe(p);
  });

  it('leaves a path with no timestamp unchanged', () => {
    const p = 'cli/openai/gpt-5.5-pro/summary.json';
    expect(normalizeUploadPath(p)).toBe(p);
  });
});

describe('shouldUploadFile', () => {
  it('excludes raw transcripts when uploading all artifacts', () => {
    expect(shouldUploadFile(`${RUN}/transcript-raw.jsonl`, 'all')).toBe(false);
  });

  it('keeps the parsed transcript and result files when uploading all', () => {
    expect(shouldUploadFile(`${RUN}/transcript.json`, 'all')).toBe(true);
    expect(shouldUploadFile(`${RUN}/result.json`, 'all')).toBe(true);
    expect(
      shouldUploadFile(`exp/m/${TIMESTAMP}/_deploy/summary.json`, 'all')
    ).toBe(true);
  });

  it('only keeps result files when uploading results', () => {
    expect(shouldUploadFile(`${RUN}/transcript-raw.jsonl`, 'results')).toBe(
      false
    );
    expect(shouldUploadFile(`${RUN}/transcript.json`, 'results')).toBe(false);
    expect(shouldUploadFile(`${RUN}/result.json`, 'results')).toBe(true);
    expect(
      shouldUploadFile(`exp/m/${TIMESTAMP}/_deploy/summary.json`, 'results')
    ).toBe(true);
  });
});
