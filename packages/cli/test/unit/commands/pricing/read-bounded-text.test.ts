import { describe, expect, it } from 'vitest';
import { ReadableStream } from 'node:stream/web';
import {
  MAX_PRICING_BYTES,
  PricingResponseTooLargeError,
  readBoundedText,
} from '../../../../src/commands/pricing/read-bounded-text';

describe('readBoundedText', () => {
  it('reads a small markdown body', async () => {
    const response = new Response('hello', {
      headers: { 'content-type': 'text/markdown' },
    });
    await expect(readBoundedText(response)).resolves.toBe('hello');
  });

  it('rejects a Content-Length above the cap without consuming the body', async () => {
    const response = new Response('x'.repeat(16), {
      headers: { 'content-length': String(MAX_PRICING_BYTES + 1) },
    });
    await expect(readBoundedText(response)).rejects.toBeInstanceOf(
      PricingResponseTooLargeError
    );
  });

  it('rejects a streamed body that exceeds the cap', async () => {
    const chunk = new Uint8Array(64 * 1024);
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        if (pulled > 10) {
          controller.close();
          return;
        }
        controller.enqueue(chunk);
      },
    });
    await expect(
      readBoundedText({ body: stream, headers: new Headers() })
    ).rejects.toBeInstanceOf(PricingResponseTooLargeError);
  });
});
