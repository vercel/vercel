import chalk from 'chalk';
import logo from '../../util/output/logo';
import { getPkgName } from '../../util/pkg-name';

export const help = () => {
  return `
  ${chalk.bold(`${logo} ${getPkgName()} [deploy]`)} [path-to-project] [options]

  --prod                         Create a production deployment
  -p, --public                   Deployment is public (${chalk.dim(
    '`/_src`'
  )} is exposed)
  -e, --env                      Include an env var during run time (e.g.: ${chalk.dim(
    '`-e KEY=value`'
  )}). Can appear many times.
  -b, --build-env                Similar to ${chalk.dim(
    '`--env`'
  )} but for build time only.
  -m, --meta                     Add metadata for the deployment (e.g.: ${chalk.dim(
    '`-m KEY=value`'
  )}). Can appear many times.
  --no-wait                      Don't wait for the deployment to finish
  -f, --force                    Force a new deployment even if nothing has changed
  --with-cache                   Retain build cache when using "--force"
  --regions                      Set default regions to enable the deployment on

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Deploy the current directory

    ${chalk.cyan(`$ ${getPkgName()}`)}

  ${chalk.gray('–')} Deploy a custom path

    ${chalk.cyan(`$ ${getPkgName()} /usr/src/project`)}

  ${chalk.gray('–')} Deploy with Environment Variables

    ${chalk.cyan(`$ ${getPkgName()} -e NODE_ENV=production`)}

  ${chalk.gray('–')} Deploy with prebuilt outputs

    ${chalk.cyan(`$ ${getPkgName()} build`)}
    ${chalk.cyan(`$ ${getPkgName()} deploy --prebuilt`)}

  ${chalk.gray('–')} Write Deployment URL to a file

    ${chalk.cyan(`$ ${getPkgName()} > deployment-url.txt`)}
`;
};
