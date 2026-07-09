import { describe, expect, it, vi } from 'vitest';
import {
  acquireRelease,
  createAbortController,
  defer,
} from '../../../../src/util/sandbox/disposables';
import { ignoreAbortErrors } from '../../../../src/util/sandbox/abort-controller';

describe('Symbol.dispose polyfill', () => {
  it('defines Symbol.dispose and Symbol.asyncDispose', () => {
    expect(typeof Symbol.dispose).not.toBe('undefined');
    expect(typeof Symbol.asyncDispose).not.toBe('undefined');
  });
});

describe('acquireRelease', () => {
  it('runs release with the acquired value on dispose', () => {
    const release = vi.fn();
    const resource = acquireRelease(() => ({ id: 1 }), release);
    expect(release).not.toHaveBeenCalled();
    resource[Symbol.dispose]();
    expect(release).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });

  it('runs release via a real `using` block on exit', () => {
    const release = vi.fn();
    {
      using resource = acquireRelease(() => ({ id: 2 }), release);
      expect(release).not.toHaveBeenCalled();
      expect(resource.id).toBe(2);
    }
    expect(release).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
  });
});

describe('defer', () => {
  it('runs fn on Symbol.dispose', () => {
    const fn = vi.fn();
    const disposable = defer(fn);
    expect(fn).not.toHaveBeenCalled();
    disposable[Symbol.dispose]();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('runs fn via a real `using` block on exit', () => {
    const fn = vi.fn();
    {
      using _disposable = defer(fn);
      expect(fn).not.toHaveBeenCalled();
    }
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('createAbortController', () => {
  it('sets signal.aborted on abort()', () => {
    const controller = createAbortController('test reason');
    expect(controller.signal.aborted).toBe(false);
    controller.abort();
    expect(controller.signal.aborted).toBe(true);
  });

  it('aborts with the provided reason by default', () => {
    const controller = createAbortController('default reason');
    controller.abort();
    expect(controller.signal.reason).toBe('default reason');
  });

  it('aborts with an override reason when given', () => {
    const controller = createAbortController('default reason');
    controller.abort('override reason');
    expect(controller.signal.reason).toBe('override reason');
  });

  it('aborts on Symbol.dispose', () => {
    const controller = createAbortController('disposed');
    controller[Symbol.dispose]();
    expect(controller.signal.aborted).toBe(true);
  });

  it('ignoreInterruptions swallows an AbortError once aborted', () => {
    const controller = createAbortController('test reason');
    controller.abort();
    const abortError = Object.assign(new Error('aborted'), {
      name: 'AbortError',
    });
    expect(() => controller.ignoreInterruptions(abortError)).not.toThrow();
  });

  it('ignoreInterruptions rethrows a normal Error', () => {
    const controller = createAbortController('test reason');
    const err = new Error('boom');
    expect(() => controller.ignoreInterruptions(err)).toThrow('boom');
  });
});

describe('ignoreAbortErrors', () => {
  it('swallows any error once the signal is aborted', () => {
    const controller = new AbortController();
    controller.abort();
    const ignore = ignoreAbortErrors(controller.signal);
    expect(() => ignore(new Error('boom'))).not.toThrow();
  });

  it('rethrows when the signal is not aborted', () => {
    const controller = new AbortController();
    const ignore = ignoreAbortErrors(controller.signal);
    const err = new Error('boom');
    expect(() => ignore(err)).toThrow('boom');
  });
});
