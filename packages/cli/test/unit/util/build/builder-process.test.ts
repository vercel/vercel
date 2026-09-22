import { describe, expect, it } from 'vitest';
import { createServiceLinePrefixer } from '../../../../src/util/build/builder-process';

// createServiceLinePrefixer tags each complete line of a forked build's piped output with its
// service, so the build-container can attribute build log lines. The tricky part is line
// buffering: a data chunk may contain zero, partial, or several newlines.
describe('createServiceLinePrefixer', () => {
  function sink() {
    const chunks: string[] = [];
    return {
      chunks,
      dest: {
        write: (s: string) => {
          chunks.push(s);
          return true;
        },
      },
    };
  }

  it('prefixes each complete line', () => {
    const { chunks, dest } = sink();
    const p = createServiceLinePrefixer('frontend', dest);
    p.onData('building\ncompiled\n');
    p.flush();
    expect(chunks.join('')).toBe(
      '[vc:service:frontend] building\n[vc:service:frontend] compiled\n'
    );
  });

  it('buffers a partial line across chunks and only tags at line starts', () => {
    const { chunks, dest } = sink();
    const p = createServiceLinePrefixer('api', dest);
    p.onData('Instal');
    p.onData('ling deps\nDone\n');
    p.flush();
    expect(chunks.join('')).toBe(
      '[vc:service:api] Installing deps\n[vc:service:api] Done\n'
    );
  });

  it('flushes an unterminated trailing line on flush', () => {
    const { chunks, dest } = sink();
    const p = createServiceLinePrefixer('api', dest);
    p.onData('no newline yet');
    expect(chunks.join('')).toBe('');
    p.flush();
    expect(chunks.join('')).toBe('[vc:service:api] no newline yet');
  });

  it('handles multiple newlines in one chunk', () => {
    const { chunks, dest } = sink();
    const p = createServiceLinePrefixer('web', dest);
    p.onData('a\nb\nc\n');
    p.flush();
    expect(chunks.join('')).toBe(
      '[vc:service:web] a\n[vc:service:web] b\n[vc:service:web] c\n'
    );
  });

  it('does not emit anything until a newline arrives', () => {
    const { chunks, dest } = sink();
    const p = createServiceLinePrefixer('web', dest);
    p.onData('partial');
    expect(chunks).toHaveLength(0);
  });
});
