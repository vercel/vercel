import { basename } from 'path';

export default function getProjectName({
  argv,
  nowConfig,
  isFile,
  paths,
  pre,
}) {
  const nameCli = argv['--name'] || argv.name;

  if (nameCli) {
    return nameCli;
  }

  if (nowConfig.name) {
    return nowConfig.name;
  }

  // For the legacy deployment pipeline, the name might have already
  // been determined using `package.json`.
  if (pre) {
    return pre;
  }

  if (isFile || paths.length > 1) {
    return 'files';
  }

  // Otherwise let's send the name of the directory
  return basename(paths[0]);
}
