import fs from 'fs';
import { join } from 'path';

const outputDir = join(process.cwd(), '.vercel', 'output');
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  join(outputDir, 'config.json'),
  JSON.stringify({
    version: 3,
    deploymentId: '12345678901234567890123456789012',
  }, null, 2)
);
