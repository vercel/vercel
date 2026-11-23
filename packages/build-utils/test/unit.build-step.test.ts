import { PassThrough } from 'stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { markBuildStep } from '../src';

describe('markBuildStep()', () => {
  const originalValue = process.env.VERCEL_BUILD_STEP_MARKERS;
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    log.mockRestore();
    if (originalValue === undefined) {
      delete process.env.VERCEL_BUILD_STEP_MARKERS;
    } else {
      process.env.VERCEL_BUILD_STEP_MARKERS = originalValue;
    }
  });

  it('prints nothing unless the build container asks for markers', () => {
    delete process.env.VERCEL_BUILD_STEP_MARKERS;
    markBuildStep('INSTALLING_DEPENDENCIES');
    expect(log).not.toHaveBeenCalled();
  });

  it('prints a marker line when asked', () => {
    process.env.VERCEL_BUILD_STEP_MARKERS = '1';
    markBuildStep('BUILDING');
    expect(log).toHaveBeenCalledWith('[vc:step:BUILDING]');
  });

  it('writes the marker to the given stream', () => {
    process.env.VERCEL_BUILD_STEP_MARKERS = '1';
    const stream = new PassThrough();
    const chunks: string[] = [];
    stream.on('data', chunk => chunks.push(String(chunk)));
    markBuildStep('INSTALLING_DEPENDENCIES', stream);
    expect(chunks.join('')).toBe('[vc:step:INSTALLING_DEPENDENCIES]\n');
    expect(log).not.toHaveBeenCalled();
  });
});
