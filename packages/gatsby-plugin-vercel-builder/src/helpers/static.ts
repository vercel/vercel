import { join } from 'path';
import { copy, ensureDir } from 'fs-extra';

export async function createStaticDir({ prefix }: { prefix?: string }) {
  const targetDir = join(process.cwd(), '.vercel', 'output', 'static');
  await ensureDir(targetDir);
  const paths = [process.cwd(), 'public'];
  if (prefix) {
    paths.push(prefix);
  }
  await copy(join(...paths), targetDir);
}
