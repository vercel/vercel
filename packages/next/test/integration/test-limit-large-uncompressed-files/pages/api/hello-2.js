import fs from 'fs';
import path from 'path';

try {
  fs.readFileSync(path.join(process.cwd(), 'data.txt'));
} catch (_) {
  /**/
}

export default function handler(req, res) {
  res.end('hello');
}
