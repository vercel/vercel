import { MockClient } from '../mocks/client';

export function readOutputStream(
  client: MockClient,
  length: number = 3
): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const timeout = setTimeout(() => {
      reject();
    }, 3000);

    client.stderr.resume();
    client.stderr.on('data', chunk => {
      chunks.push(chunk);
      if (chunks.length === length) {
        clearTimeout(timeout);
        resolve(chunks.toString().replace(/,/g, ''));
      }
    });
    client.stderr.on('error', reject);
  });
}
