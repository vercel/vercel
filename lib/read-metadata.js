import chalk from 'chalk';
import { readFile } from 'fs-promise';
import { basename, resolve as resolvePath } from 'path';
import { parse as parseDockerfile } from 'docker-file-parser';

export default async function (path, {
  deploymentType = 'npm',
  quiet = false,
}) {
  let pkg = {};
  let name, description;
  if ('npm' === deploymentType) {
    try {
      pkg = await readFile(resolvePath(path, 'package.json'));
      pkg = JSON.parse(pkg);
    } catch (err) {
      const e = Error(`Failed to read JSON in "${path}/package.json"`);
      e.userError = true;
      throw e;
    }

    if (!pkg.scripts || (!pkg.scripts.start && !pkg.scripts['now-start'])) {
      const e = Error('Missing `start` (or `now-start`) script in `package.json`. ' +
        'See: https://docs.npmjs.com/cli/start.');
      e.userError = true;
      throw e;
    }

    if (null == pkg.name || 'string' !== typeof pkg.name) {
      name = basename(path);
      if (!quiet) console.log(`> No \`name\` in \`package.json\`, using ${chalk.bold(name)}`);
    } else {
      name = pkg.name;
    }

    description = pkg.description;
  } else if ('docker' === deploymentType) {
    let docker;
    try {
      const dockerfile = await readFile(resolvePath(path, 'Dockerfile'), 'utf8');
      docker = parseDockerfile(dockerfile, { includeComments: true });
    } catch (err) {
      const e = Error(`Failed to parse "${path}/Dockerfile"`);
      e.userError = true;
      throw e;
    }

    if (!docker.length) {
      const e = Error('No commands found in `Dockerfile`');
      e.userError = true;
      throw e;
    }

    if (!docker.some((cmd) => 'CMD' === cmd.name)) {
      const e = Error('No `CMD` found in `Dockerfile`. ' +
        'See: https://docs.docker.com/engine/reference/builder/#/cmd');
      e.userError = true;
      throw e;
    }

    if (!docker.some((cmd) => 'EXPOSE' === cmd.name)) {
      const e = Error('No `EXPOSE` found in `Dockerfile`. A port must be supplied. ' +
        'See: https://docs.docker.com/engine/reference/builder/#/expose');
      e.userError = true;
      throw e;
    }

    const labels = {};
    docker
    .filter(cmd => 'LABEL' === cmd.name)
    .forEach(({ args }) => {
      for (let key in args) {
        // unescape and convert into string
        try {
          labels[key] = JSON.parse(args[key]);
        } catch (err) {
          const e = Error(`Error parsing value for LABEL ${key} in \`Dockerfile\``);
          e.userError = true;
          throw e;
        }
      }
    });

    if (null == labels.name) {
      name = basename(path);
      if (!quiet) console.log(`> No \`name\` LABEL in \`Dockerfile\`, using ${chalk.bold(name)}`);
    } else {
      name = labels.name;
    }

    description = labels.description;
  }

  return {
    name,
    description,
    pkg,
  };
}
