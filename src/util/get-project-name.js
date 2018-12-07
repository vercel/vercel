import {basename} from 'path';

module.exports = function getProjectName({argv, nowConfig, isFile, paths}) {
  const projectNameCli = argv['--project'] || argv.project;
  if (projectNameCli) {
    return projectNameCli;
  }

  if (nowConfig.project) {
    return nowConfig.project;
  }

  if (isFile || paths.length > 1) {
    return 'files';
  }

  // Otherwise let's send the name of the directory
  return basename(paths[0]);
};
