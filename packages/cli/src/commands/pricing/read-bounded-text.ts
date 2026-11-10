export const MAX_PRICING_BYTES = 512 * 1024;

export class PricingResponseTooLargeError extends Error {
  constructor() {
    super('Pricing response exceeded the size limit');
    this.name = 'PricingResponseTooLargeError';
  }
}

export async function readBoundedText(
  response: Pick<Response, 'body' | 'headers'>,
  maxBytes = MAX_PRICING_BYTES
): Promise<string> {
  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const bytes = Number(contentLength);
    if (Number.isFinite(bytes) && bytes > maxBytes) {
      throw new PricingResponseTooLargeError();
    }
  }

  if (!response.body) {
    throw new Error('Pricing response returned an empty body.');
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }

    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new PricingResponseTooLargeError();
    }

    chunks.push(value);
  }

  const buffer = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(buffer);
}
