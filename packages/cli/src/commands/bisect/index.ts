import open from 'open';
import boxen from 'boxen';
import execa from 'execa';
import plural from 'pluralize';
import { resolve } from 'path';
import chalk, { Chalk } from 'chalk';
import { URLSearchParams, parse } from 'url';

import sleep from '../../util/sleep';
import formatDate from '../../util/format-date';
import link from '../../util/output/link';
import logo from '../../util/output/logo';
import getArgs from '../../util/get-args';
import Client from '../../util/client';
import { getPkgName } from '../../util/pkg-name';
import { Deployment, PaginationOptions } from '../../types';
import { normalizeURL } from '../../util/bisect/normalize-url';

interface DeploymentV6
  extends Pick<
    Deployment,
    'url' | 'target' | 'projectId' | 'ownerId' | 'meta' | 'inspectorUrl'
  > {
  createdAt: number;
}

interface Deployments {
  deployments: DeploymentV6[];
  pagination: PaginationOptions;
}

const pkgName = getPkgName();

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} ${pkgName} bisect`)} [options]

  ${chalk.dim('Options:')}

    -h, --help                 Output usage information
    -d, --debug                Debug mode [off]
    -b, --bad                  Known bad URL
    -g, --good                 Known good URL
    -o, --open                 Automatically open each URL in the browser
    -p, --path                 Subpath of the deployment URL to test
    -r, --run                  Test script to run for each deployment

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Bisect the current project interactively

      ${chalk.cyan(`$ ${pkgName} bisect`)}

  ${chalk.gray('–')} Bisect with a known bad deployment

      ${chalk.cyan(`$ ${pkgName} bisect --bad example-310pce9i0.vercel.app`)}

  ${chalk.gray('–')} Automated bisect with a run script

      ${chalk.cyan(`$ ${pkgName} bisect --run ./test.sh`)}
  `);
};

export default async function main(client: Client): Promise<number> {
  const { output } = client;

  const argv = getArgs(client.argv.slice(2), {
    '--bad': String,
    '-b': '--bad',
    '--good': String,
    '-g': '--good',
    '--open': Boolean,
    '-o': '--open',
    '--path': String,
    '-p': '--path',
    '--run': String,
    '-r': '--run',
  });

  if (argv['--help']) {
    help();
    return 2;
  }

  let bad =
    argv['--bad'] ||
    (await prompt(client, `Specify a URL where the bug occurs:`));
  let good =
    argv['--good'] ||
    (await prompt(client, `Specify a URL where the bug does not occur:`));
  let subpath = argv['--path'] || '';
  let run = argv['--run'] || '';
  const openEnabled = argv['--open'] || false;

  if (run) {
    run = resolve(run);
  }

  bad = normalizeURL(bad);
  let parsed = parse(bad);
  if (!parsed.hostname) {
    output.error('Invalid input: no hostname provided');
    return 1;
  }
  bad = parsed.hostname;
  if (typeof parsed.path === 'string' && parsed.path !== '/') {
    if (subpath && subpath !== parsed.path) {
      output.note(
        `Ignoring subpath ${chalk.bold(
          parsed.path
        )} in favor of \`--path\` argument ${chalk.bold(subpath)}`
      );
    } else {
      subpath = parsed.path;
    }
  }

  good = normalizeURL(good);
  parsed = parse(good);
  if (!parsed.hostname) {
    output.error('Invalid input: no hostname provided');
    return 1;
  }
  good = parsed.hostname;
  if (
    typeof parsed.path === 'string' &&
    parsed.path !== '/' &&
    subpath &&
    subpath !== parsed.path
  ) {
    output.note(
      `Ignoring subpath ${chalk.bold(
        parsed.path
      )} which does not match ${chalk.bold(subpath)}`
    );
  }

  if (!subpath) {
    subpath = await prompt(
      client,
      `Specify the URL subpath where the bug occurs:`
    );
  }

  output.spinner('Retrieving deployments…');

  // `getDeployment` cannot be parallelized because it might prompt for login
  const badDeployment = await getDeployment(client, bad).catch(err => err);

  if (badDeployment) {
    if (badDeployment instanceof Error) {
      badDeployment.message += ` when requesting bad deployment "${normalizeURL(
        bad
      )}"`;
      output.prettyError(badDeployment);
      return 1;
    }
    bad = badDeployment.url;
  } else {
    output.error(`Failed to retrieve ${chalk.bold('bad')} Deployment: ${bad}`);
    return 1;
  }

  // `getDeployment` cannot be parallelized because it might prompt for login
  const goodDeployment = await getDeployment(client, good).catch(err => err);

  if (goodDeployment) {
    if (goodDeployment instanceof Error) {
      goodDeployment.message += ` when requesting good deployment "${normalizeURL(
        good
      )}"`;
      output.prettyError(goodDeployment);
      return 1;
    }
    good = goodDeployment.url;
  } else {
    output.error(
      `Failed to retrieve ${chalk.bold('good')} Deployment: ${good}`
    );
    return 1;
  }

  const { projectId } = badDeployment;

  if (projectId !== goodDeployment.projectId) {
    output.error(`Good and Bad deployments must be from the same Project`);
    return 1;
  }

  if (badDeployment.createdAt < goodDeployment.createdAt) {
    output.error(`Good deployment must be older than the Bad deployment`);
    return 1;
  }

  if (badDeployment.target !== goodDeployment.target) {
    output.error(
      `Bad deployment target "${
        badDeployment.target || 'preview'
      }" does not match good deployment target "${
        goodDeployment.target || 'preview'
      }"`
    );
    return 1;
  }

  // Fetch all the project's "READY" deployments with the pagination API
  let deployments: DeploymentV6[] = [];
  let next: number | undefined = badDeployment.createdAt + 1;
  do {
    const query = new URLSearchParams();
    query.set('projectId', projectId);
    if (badDeployment.target) {
      query.set('target', badDeployment.target);
    }
    query.set('limit', '100');
    query.set('state', 'READY');
    if (next) {
      query.set('until', String(next));
    }

    const res = await client.fetch<Deployments>(`/v6/deployments?${query}`, {
      accountId: badDeployment.ownerId,
    });

    next = res.pagination.next;

    let newDeployments = res.deployments;

    // If we have the "good" deployment in this chunk, then we're done
    for (let i = 0; i < newDeployments.length; i++) {
      if (newDeployments[i].url === good) {
        // grab all deployments up until the good one
        newDeployments = newDeployments.slice(0, i);
        next = undefined;
        break;
      }
    }

    deployments = deployments.concat(newDeployments);

    if (next) {
      // Small sleep to avoid rate limiting
      await sleep(100);
    }
  } while (next);

  if (!deployments.length) {
    output.error(
      'Cannot bisect because this project does not have any deployments'
    );
    return 1;
  }

  // The first deployment is the one that was marked
  // as "bad", so that one does not need to be tested
  let lastBad = deployments.shift()!;

  while (deployments.length > 0) {
    // Add a blank space before the next step
    output.print('\n');
    const middleIndex = Math.floor(deployments.length / 2);
    const deployment = deployments[middleIndex];
    const rem = plural('deployment', deployments.length, true);
    const steps = Math.floor(Math.log2(deployments.length));
    const pSteps = plural('step', steps, true);
    output.log(
      chalk.magenta(
        `${chalk.bold(
          'Bisecting:'
        )} ${rem} left to test after this (roughly ${pSteps})`
      ),
      chalk.magenta
    );
    const testUrl = `https://${deployment.url}${subpath}`;
    output.log(`${chalk.bold('Deployment URL:')} ${link(testUrl)}`);

    output.log(`${chalk.bold('Date:')} ${formatDate(deployment.createdAt)}`);

    const commit = getCommit(deployment);
    if (commit) {
      const shortSha = commit.sha.substring(0, 7);
      const firstLine = commit.message.split('\n')[0];
      output.log(`${chalk.bold('Commit:')} [${shortSha}] ${firstLine}`);
    }

    let action: string;
    if (run) {
      const proc = await execa(run, [testUrl], {
        stdio: 'inherit',
        reject: false,
        env: {
          ...process.env,
          HOST: deployment.url,
          URL: testUrl,
        },
      });
      if (proc instanceof Error && typeof proc.exitCode !== 'number') {
        // Script does not exist or is not executable, so exit
        output.prettyError(proc);
        return 1;
      }
      const { exitCode } = proc;
      let color: Chalk;
      if (exitCode === 0) {
        color = chalk.green;
        action = 'good';
      } else if (exitCode === 125) {
        action = 'skip';
        color = chalk.grey;
      } else {
        action = 'bad';
        color = chalk.red;
      }
      output.log(
        `Run script returned exit code ${chalk.bold(String(exitCode))}: ${color(
          action
        )}`
      );
    } else {
      if (openEnabled) {
        await open(testUrl);
      }
      const answer = await client.prompt({
        type: 'expand',
        name: 'action',
        message: 'Select an action:',
        choices: [
          { key: 'g', name: 'Good', value: 'good' },
          { key: 'b', name: 'Bad', value: 'bad' },
          { key: 's', name: 'Skip', value: 'skip' },
        ],
      });
      action = answer.action;
    }

    if (action === 'good') {
      deployments = deployments.slice(0, middleIndex);
    } else if (action === 'bad') {
      lastBad = deployment;
      deployments = deployments.slice(middleIndex + 1);
    } else if (action === 'skip') {
      deployments.splice(middleIndex, 1);
    }
  }

  output.print('\n');

  let result = [
    chalk.bold(
      `The first bad deployment is: ${link(`https://${lastBad.url}`)}`
    ),
    '',
    `   ${chalk.bold('Date:')} ${formatDate(lastBad.createdAt)}`,
  ];

  const commit = getCommit(lastBad);
  if (commit) {
    const shortSha = commit.sha.substring(0, 7);
    const firstLine = commit.message.split('\n')[0];
    result.push(` ${chalk.bold('Commit:')} [${shortSha}] ${firstLine}`);
  }

  result.push(`${chalk.bold('Inspect:')} ${link(lastBad.inspectorUrl)}`);

  output.print(boxen(result.join('\n'), { padding: 1 }));
  output.print('\n');

  return 0;
}

function getDeployment(
  client: Client,
  hostname: string
): Promise<DeploymentV6> {
  const query = new URLSearchParams();
  query.set('url', hostname);
  query.set('resolve', '1');
  query.set('noState', '1');
  return client.fetch<DeploymentV6>(`/v10/deployments/get?${query}`);
}

function getCommit(deployment: DeploymentV6) {
  const sha =
    deployment.meta?.githubCommitSha ||
    deployment.meta?.gitlabCommitSha ||
    deployment.meta?.bitbucketCommitSha;
  if (!sha) return null;
  const message =
    deployment.meta?.githubCommitMessage ||
    deployment.meta?.gitlabCommitMessage ||
    deployment.meta?.bitbucketCommitMessage;
  return { sha, message };
}

async function prompt(client: Client, message: string): Promise<string> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { val } = await client.prompt({
      type: 'input',
      name: 'val',
      message,
    });
    if (val) {
      return val;
    } else {
      client.output.error('A value must be specified');
    }
  }
}
