import fs from 'fs';
import path from 'path';

export async function getContent() {
  const files = fs.readdirSync(path.join(process.cwd(), 'content'));
  return files.map(file =>
    fs.readFileSync(path.join(process.cwd(), 'content', file), 'utf8')
  );
}
