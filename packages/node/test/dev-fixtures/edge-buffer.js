import B from 'node:buffer';
import { Buffer } from 'buffer';

export const config = { runtime: 'edge' };

export default async () => {
  const encoded = Buffer.from('Hello, world!').toString('base64');
  return new Response(
    JSON.stringify({
      encoded,
      'Buffer === B.Buffer': Buffer === B.Buffer,
    })
  );
};
