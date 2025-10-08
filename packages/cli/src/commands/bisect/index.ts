import open from 'open';
import execa from 'execa';
import plural from 'pluralize';
import { resolve } from 'path';
import chalk, { type Chalk } from 'chalk';
import { URLSearchParams, parse } from 'url';

import box from '../../util/output/box';
import formatDate from '../../util/format-date';
import link from '../../util/output/link';
import { parseArguments } from '../../util/get-args';
import type Client from '../../util/client';
import type { Deployment } from '@vercel-internals/types';
import { normalizeURL } from '../../util/bisect/normalize-url';
import getScope from '../../util/get-scope';
import getDeployment from '../../util/get-deployment';
import { help } from '../help';
import { bisectCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { BisectTelemetryClient } from '../../util/telemetry/commands/bisect';

interface Deployments {
  deployments: Deployment[];
}
export default async function bisect(client: Client): Promise<number> {
  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(bisectCommand.options);

  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const telemetry = new BisectTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('bisect');
    output.print(help(bisectCommand, { columns: client.stderr.columns }));
    return 2;
  }

  telemetry.trackCliOptionGood(parsedArgs.flags['--good']);
  telemetry.trackCliOptionBad(parsedArgs.flags['--bad']);
  telemetry.trackCliOptionPath(parsedArgs.flags['--path']);
  telemetry.trackCliOptionRun(parsedArgs.flags['--run']);
  telemetry.trackCliFlagOpen(parsedArgs.flags['--open']);

  const scope = await getScope(client);
  const { contextName } = scope;

  let bad =
    parsedArgs.flags['--bad'] ||
    (await client.input.text({
      message: `Specify a URL where the bug occurs:`,
      validate: val => (val ? true : 'A URL must be provided'),
    }));
  let good =
    parsedArgs.flags['--good'] ||
    (await client.input.text({
      message: `Specify a URL where the bug does not occur:`,
      validate: val => (val ? true : 'A URL must be provided'),
    }));
  let subpath = parsedArgs.flags['--path'] || '';
  let run = parsedArgs.flags['--run'] || '';
  const openEnabled = parsedArgs.flags['--open'] || false;

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
    subpath = await client.input.text({
      message: `Specify the URL subpath where the bug occurs:`,
      validate: val => (val ? true : 'A subpath must be provided'),
    });
  }

  output.spinner('Retrieving deployments…');

  // `getDeployment` cannot be parallelized because it might prompt for login
  const badDeployment = await getDeployment(client, contextName, bad).catch(
    err => err
  );

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
  const goodDeployment = await getDeployment(client, contextName, good).catch(
    err => err
  );

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
  let deployments: Deployment[] = [];

  const query = new URLSearchParams();
  query.set('projectId', projectId);
  if (badDeployment.target) {
    query.set('target', badDeployment.target);
  }
  query.set('state', 'READY');
  query.set('until', String(badDeployment.createdAt + 1));

  for await (const chunk of client.fetchPaginated<Deployments>(
    `/v6/deployments?${query}`,
    {
      accountId: badDeployment.ownerId,
    }
  )) {
    let newDeployments = chunk.deployments;

    // If we have the "good" deployment in this chunk, then we're done
    let hasGood = false;
    for (let i = 0; i < newDeployments.length; i++) {
      if (newDeployments[i].url === good) {
        // grab all deployments up until the good one
        newDeployments = newDeployments.slice(0, i);
        hasGood = true;
        break;
      }
    }

    deployments = deployments.concat(newDeployments);
    if (hasGood) break;
  }

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
      const firstLine = commit.message?.split('\n')[0];
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
      action = await client.input.expand({
        message: 'Select an action:',
        choices: [
          { key: 'g', name: 'Good', value: 'good' },
          { key: 'b', name: 'Bad', value: 'bad' },
          { key: 's', name: 'Skip', value: 'skip' },
        ],
      });
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

  const result = [
    chalk.bold(
      `The first bad deployment is: ${link(`https://${lastBad.url}`)}`
    ),
    '',
    `   ${chalk.bold('Date:')} ${formatDate(lastBad.createdAt)}`,
  ];

  const commit = getCommit(lastBad);
  if (commit) {
    const shortSha = commit.sha.substring(0, 7);
    const firstLine = commit.message?.split('\n')[0];
    result.push(` ${chalk.bold('Commit:')} [${shortSha}] ${firstLine}`);
  }

  result.push(`${chalk.bold('Inspect:')} ${link(lastBad.inspectorUrl)}`);

  output.print(box(result.join('\n')));
  output.print('\n');

  return 0;
}

function getCommit(deployment: Deployment) {
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
