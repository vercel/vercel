import { ensureDir, symlinkSync } from 'fs-extra';
import path, { join, normalize, sep } from 'path';

const removeTrailingSlash = (str: string) => str.replace(/\/$/, '');

export const createSymlink = async (pathName: string) => {
  const functionName = removeTrailingSlash(pathName).split(sep).pop();

  const dirPath = removeTrailingSlash(
    join('.vercel', 'output', 'functions', normalize(join(pathName, '..')))
  );

  await ensureDir(dirPath);

  symlinkSync(
    path.relative(dirPath, join('.vercel', 'output', 'functions', '_ssr.func')),
    path.join(dirPath, `./${functionName}.func`),
    'file'
  );
};
