import { join } from 'path';
import { readFileSync } from 'fs';

const manifest = JSON.parse(
  readFileSync(
    join(__dirname, '..', '..', '..', 'examples', 'manifest.json')
  ).toString()
);

export async function getExampleList() {
  return manifest;
}
