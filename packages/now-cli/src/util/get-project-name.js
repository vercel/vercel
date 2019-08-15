import { basename } from 'path';

export default function getProjectName({
  argv,
  nowConfig,
  paths,
  pre
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

  // Otherwise let's send the name of the file/directory
  return basename(paths[0]);
}
