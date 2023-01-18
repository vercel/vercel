import { join } from 'path';

import { copy, ensureDir } from 'fs-extra';

export async function createStaticDir() {
  const targetDir = join(process.cwd(), '.vercel', 'output', 'static');
  await ensureDir(targetDir);

  await copy(join(process.cwd(), 'public'), targetDir);
}
