import { basename } from 'path';

export default function getProjectName({ argv, nowConfig, isFile, paths }) {
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
