import arg from 'arg';
import { basename } from 'path';
import { VercelConfig } from '@vercel/client';

export interface GetProjectNameOptions {
  argv: arg.Result<{ '--name': StringConstructor }>;
  nowConfig?: VercelConfig;
  isFile: boolean;
  paths: string[];
}

export default function getProjectName({
  argv,
  nowConfig = {},
  isFile,
  paths = [],
}: GetProjectNameOptions) {
  const nameCli = argv['--name'];

  if (nameCli) {
    return nameCli;
  }

  if (nowConfig.name) {
    return nowConfig.name;
  }

  if (isFile || paths.length > 1) {
    return 'files';
  }

  // Otherwise, use the name of the directory
  return basename(paths[0] || '');
}
