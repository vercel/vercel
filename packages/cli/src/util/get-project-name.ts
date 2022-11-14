import { basename } from 'path';
import { VercelConfig } from '@vercel/client';

export interface GetProjectNameOptions {
  argv: { '--name'?: string };
  nowConfig?: VercelConfig;
  paths?: string[];
}

export default function getProjectName({
  argv,
  nowConfig = {},
  paths = [],
}: GetProjectNameOptions) {
  const nameCli = argv['--name'];

  if (nameCli) {
    return nameCli;
  }

  if (nowConfig.name) {
    return nowConfig.name;
  }

  // Otherwise, use the name of the directory
  return basename(paths[0] || '');
}
