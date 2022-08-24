import { readFileSync } from 'fs';
import { join } from 'path';

export default function handler(_req, res) {
  // This build.js asset should be included but not the dep.js asset
  // because this is readFile(), not require(). It also shouldn't transpile
  // with babel because it should be considered an asset.
  const file = join(process.cwd(), 'assets', 'build.js');
  const content = readFileSync(file, 'utf8');
  res.setHeader('Content-Type', 'application/javascript');
  return res.end(content);
}
