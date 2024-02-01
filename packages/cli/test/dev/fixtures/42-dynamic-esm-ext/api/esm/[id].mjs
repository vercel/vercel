import { readFileSync } from 'fs';

export default function handler(_req, res) {
  const url = new URL('[id].mjs', import.meta.url);
  const file = readFileSync(url, 'utf8');
  res.end(file ? 'found .mjs' : 'did not find .mjs');
};
