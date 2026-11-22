import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

interface Step {
  id?: string;
  name: string;
  if?: string;
  'continue-on-error'?: boolean;
  'timeout-minutes'?: number;
  'working-directory'?: string;
  env?: Record<string, string>;
  run?: string;
}

const workflow = load(
  readFileSync(
    new URL(
      '../../../../../.github/workflows/pr-binaries.yml',
      import.meta.url
    ),
    'utf8'
  )
) as { jobs: { build: { steps: Step[] } } };
const steps = workflow.jobs.build.steps;
const testStep = steps.find(step => step.id === 'binary-integration')!;

describe('PR binary integration coverage', () => {
  it('runs the existing suite against the uploaded Linux x64 executable', () => {
    expect(testStep.if).toContain("matrix.asset == 'vercel-linux-x64'");
    expect(testStep['working-directory']).toBe('packages/cli');
    expect(testStep.run).toBe(
      'pnpm test-e2e-node-all-versions --no-file-parallelism'
    );
    expect(testStep.env?.VERCEL_CLI_TEST_BINARY).toBe(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression
      '${{ github.workspace }}/packages/cli/dist-bin/vercel-linux-x64'
    );
  });

  it('lets tests and test-only setup fail the job, after upload', () => {
    const uploadIndex = steps.findIndex(step => step.id === 'blob');
    expect(uploadIndex).toBeGreaterThanOrEqual(0);
    for (const id of ['binary-test-yarn', 'binary-integration']) {
      const index = steps.findIndex(step => step.id === id);
      expect(index).toBeGreaterThan(uploadIndex);
      expect(steps[index]['continue-on-error']).not.toBe(true);
      expect(steps[index]['timeout-minutes']).toBeGreaterThan(0);
      expect(steps[index].if).toContain("matrix.asset == 'vercel-linux-x64'");
    }
  });

  it('does not mask build or upload failures', () => {
    for (const name of ['Build binary', 'Upload binary to Vercel Blob']) {
      const step = steps.find(step => step.name === name)!;
      expect(step).toBeDefined();
      expect(step['continue-on-error']).not.toBe(true);
    }
  });

  it('reports the actual outcome after a failed optional check', () => {
    const summary = steps.find(
      step => step.name === 'Summarize binary integration tests'
    )!;
    expect(summary.if).toContain('!cancelled()');
    expect(summary['continue-on-error']).not.toBe(true);
    expect(summary.env?.TEST_OUTCOME).toBe(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression
      '${{ steps.binary-integration.outcome }}'
    );
    expect(summary.run).toContain('::error::');
  });
});
