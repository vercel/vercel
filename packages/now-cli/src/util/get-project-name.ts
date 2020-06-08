import { basename } from 'path';
import { NowConfig } from './dev/types';
import { Dictionary } from 'now-client';

interface Options {
  argv: Dictionary<any>;
  nowConfig: NowConfig;
  isFile: boolean;
  paths: string[];
}

export function getProjectName({ argv, nowConfig, isFile, paths }: Options) {
  const nameCli = argv['--name'] || argv.name;

  if (nameCli) {
    return nameCli;
  }

  if (nowConfig.name) {
    return nowConfig.name;
  }

  if (isFile || paths.length > 1) {
    return 'files';
  }

  // Otherwise let's send the name of the directory
  return basename(paths[0]);
}
