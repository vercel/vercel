import { MockClient } from '../mocks/client';

export function readOutputStream(
  client: MockClient,
  length: number = 3
): Promise<string> {
  return new Promise((resolve, reject) => {
    let output: string = '';
    let lines = 0;
    const timeout = setTimeout(() => {
      reject(
        new Error(`Was waiting for ${length} lines, but only received ${lines}`)
      );
    }, 3000);

    client.stderr.resume();
    client.stderr.on('data', chunk => {
      output += chunk.toString();
      lines++;
      if (lines === length) {
        clearTimeout(timeout);
        resolve(output);
      }
    });
    client.stderr.on('error', reject);
  });
}
