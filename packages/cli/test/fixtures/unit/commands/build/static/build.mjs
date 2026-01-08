import fs from 'fs';
import { join } from 'path';

const outputDir = join(process.cwd(), '.vercel', 'output');
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  join(outputDir, 'config.json'),
  JSON.stringify({
    version: 3,
    deploymentId: 'my-deployment-123',
  }, null, 2)
);
