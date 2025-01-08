import { basename } from 'path';
import type { VercelConfig } from '@vercel/client';

export interface GetProjectNameOptions {
  nameParam?: string;
  nowConfig?: VercelConfig;
  paths?: string[];
}

export default function getProjectName({
  nameParam,
  nowConfig = {},
  paths = [],
}: GetProjectNameOptions) {
  if (nameParam) {
    return nameParam;
  }

  if (nowConfig.name) {
    return nowConfig.name;
  }

  // Otherwise, use the name of the directory
  return basename(paths[0] || '');
}
