import fs from 'fs-extra';
import { fileURLToPath } from 'node:url';

const pkgJsonFile = fileURLToPath(new URL('../package.json', import.meta.url));
export const pkgVersion = fs.readJsonSync(pkgJsonFile).version;
