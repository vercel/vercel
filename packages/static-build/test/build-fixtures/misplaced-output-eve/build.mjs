// Mimics `cd agent-app && eve build` on Vercel: the framework emits
// Build Output API one directory below the work path.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const outputDir = join(process.cwd(), 'agent-app', '.vercel', 'output');
mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'config.json'), JSON.stringify({ version: 3 }));
