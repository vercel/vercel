import { join } from 'path';
import { readFileSync } from 'fs';

const manifest = readFileSync(
  join('..', '..', '..', 'examples', 'manifest.json')
);

export async function getExampleList() {
  return manifest;
}
