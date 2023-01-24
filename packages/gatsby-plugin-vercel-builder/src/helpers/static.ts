import { join } from 'path';
import { copy, ensureDir } from 'fs-extra';

export async function createStaticDir({ prefix }: { prefix?: string }) {
  const paths = [process.cwd(), '.vercel', 'output', 'static'];
  if (prefix) {
    paths.push(prefix);
  }
  const targetDir = join(...paths);
  await ensureDir(targetDir);
  await copy(join(process.cwd(), 'public'), targetDir);
}
