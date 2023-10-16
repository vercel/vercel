import assert from 'assert';
import { existsSync, readdirSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import url from 'url';
import { resolve, join, dirname } from 'path';
import { detectFramework, LocalFileSystemDetector } from '@vercel/fs-detectors';
import * as frameworkList from '@vercel/frameworks';

const __dirname = dirname(url.fileURLToPath(import.meta.url));

const fixtures = resolve(__dirname, 'fixtures');

assert(existsSync(fixtures));

for (const dir of readdirSync(fixtures)) {
  const dotVercelPath = join(fixtures, dir, '.vercel');
  if (existsSync(dotVercelPath)) {
    rmSync(dotVercelPath, { recursive: true, force: true });
  }

  mkdirSync(dotVercelPath);

  const lfd = new LocalFileSystemDetector(join(fixtures, dir));

  const framework = await detectFramework({ fs: lfd, frameworkList: frameworkList.frameworks });

  console.log({ dir, framework })
  writeFileSync(join(dotVercelPath, 'project.json'), JSON.stringify({
    "orgId": ".",
    "projectId": ".",
    "settings": { framework }
  }));

  const gitignorePath = join(fixtures, dir, '.gitignore');

  if (existsSync(gitignorePath)) {
    const gitignoreContent = readFileSync(gitignorePath, 'utf-8');

    writeFileSync(gitignorePath, gitignoreContent.replace('.vercel', ''));
  }

}
