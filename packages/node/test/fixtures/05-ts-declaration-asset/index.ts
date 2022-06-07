import { join } from 'path';
import { readFileSync } from 'fs';

const filePath = join(__dirname, 'test.d.ts');
const fileContent = readFileSync(filePath, 'utf8');

export default function handler(_req: any, res: any) {
  res.end(fileContent);
}
