import { readFileSync } from 'fs';
import { join } from 'path';

export default function handler(_req, res) {
  // This index asset should be included but not the dep asset
  // because this is readFile(), not require().
  const file = join(process.cwd(), 'assets', 'index.a42ba133.js');
  const stringified = readFileSync(file, 'utf8');
  res.setHeader('Content-Type', 'application/javascript');
  return res.end(stringified);
}
