import { join } from 'path';
import { writeFileSync } from 'fs';

const dirRoot = join(__dirname, '..');

function envToString(key: string) {
  const value = process.env[key];
  if (!value) {
    console.log(`- Constant ${key} is not assigned`);
  }
  return JSON.stringify(value);
}

console.log('Creating constants.ts');
const filename = join(dirRoot, 'src/constants.ts');
const contents = `// This file is auto-generated
export const GA_TRACKING_ID: string | undefined = ${envToString(
  'GA_TRACKING_ID'
)};
export const SENTRY_DSN: string | undefined = ${envToString('SENTRY_DSN')};
`;

writeFileSync(filename, contents, 'utf8');
