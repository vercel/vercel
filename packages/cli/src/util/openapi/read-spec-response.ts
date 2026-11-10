import { MAX_OPENAPI_SPEC_BYTES } from './constants';

export async function readSpecResponse<T>(
  response: Response,
  url: string,
  maxBytes = MAX_OPENAPI_SPEC_BYTES
): Promise<T> {
  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const bytes = Number(contentLength);
    if (Number.isFinite(bytes) && bytes > maxBytes) {
      throw new Error(
        `OpenAPI spec from ${url} exceeds the ${maxBytes} byte limit.`
      );
    }
  }

  if (!response.body) {
    throw new Error(`OpenAPI spec from ${url} returned an empty response.`);
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
      throw new Error(
        `OpenAPI spec from ${url} exceeds the ${maxBytes} byte limit.`
      );
    }

    chunks.push(value);
  }

  const buffer = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return JSON.parse(new TextDecoder().decode(buffer)) as T;
}
