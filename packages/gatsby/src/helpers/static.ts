import { copy, ensureDir } from 'fs-extra';
import { join } from 'path';

export async function createStaticDir() {
  const targetDir = join(process.cwd(), '.vercel', 'output', 'static');
  await ensureDir(targetDir);

  await copy(join(process.cwd(), 'public'), targetDir);
}
