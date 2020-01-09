import { join } from 'path';
import { readFileSync } from 'fs';

const manifest = readFileSync(
  join(__dirname, '..', '..', '..', 'examples', 'manifest.json')
);

export async function getExampleList() {
  return manifest;
}
