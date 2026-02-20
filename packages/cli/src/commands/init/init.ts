import fs from 'node:fs';
import path from 'node:path';
import tar from 'tar-fs';
import chalk from 'chalk';

// @ts-ignore
import listInput from '../../util/input/list';
import listItem from '../../util/output/list-item';
import toHumanPath from '../../util/humanize-path';
import type Client from '../../util/client';
import { toNodeReadable } from '../../util/web-stream';
import cmd from '../../util/output/cmd';
import didYouMean from '../../util/did-you-mean';
import { getCommandName } from '../../util/pkg-name';
import output from '../../output-manager';
import type { InitTelemetryClient } from '../../util/telemetry/commands/init';

type Options = {
  '--debug': boolean;
  '--force': boolean;
  '-f': boolean;
};

type Example = {
  name: string;
  visible: boolean;
  suggestions: string[];
};

const EXAMPLE_API = 'https://examples.vercel.sh';

export default async function init(
  client: Client,
  opts: Partial<Options>,
  args: string[],
  telemetry: InitTelemetryClient
) {
  const [name, dir] = args;
  const force = opts['--force'];

  const examples = await fetchExampleList(client);

  if (!examples) {
    throw new Error('Could not fetch example list.');
  }

  const exampleList = examples.filter(x => x.visible).map(x => x.name);

  if (!name) {
    if (client.stdin.isTTY !== true) {
      output.print('No framework provided');
      return 0;
    }
    const chosen = await chooseFromDropdown(
      client,
      'Select example:',
      exampleList
    );

    if (!chosen) {
      output.log('Canceled');
      return 0;
    }

    return extractExample(client, chosen, dir, force);
  }

  if (exampleList.includes(name)) {
    telemetry.trackCliArgumentExample(name, true);
    return extractExample(client, name, dir, force);
  }

  const oldExample = examples.find(x => !x.visible && x.name === name);
  if (oldExample) {
    telemetry.trackCliArgumentExample(name, true);
    return extractExample(client, name, dir, force, 'v1');
  }

  telemetry.trackCliArgumentExample(name, false);

  const found = await guess(client, exampleList, name);

  if (typeof found === 'string') {
    return extractExample(client, found, dir, force);
  }

  output.log('No changes made.');
  return 0;
}

/**
 * Fetch example list json
 */
async function fetchExampleList(client: Client) {
  output.spinner('Fetching examples');
  const url = `${EXAMPLE_API}/v2/list.json`;

  const body = await client.fetch<Example[]>(url);
  output.stopSpinner();
  return body;
}

/**
 * Prompt user for choosing which example to init
 */
async function chooseFromDropdown(
  client: Client,
  message: string,
  exampleList: string[]
) {
  const choices = exampleList.map(name => ({
    name,
    value: name,
    short: name,
  }));

  return listInput(client, {
    message,
    choices,
  });
}

/**
 * Extract example to directory
 */
async function extractExample(
  client: Client,
  name: string,
  dir: string,
  force?: boolean,
  ver = 'v2'
) {
  const folder = prepareFolder(client.cwd, dir || name, force);
  output.spinner(`Fetching ${name}`);

  const url = `${EXAMPLE_API}/${ver}/download/${name}.tar.gz`;

  return client
    .fetch(url, { json: false })
    .then(async res => {
      output.stopSpinner();

      if (res.status !== 200) {
        throw new Error(`Could not get ${name}.tar.gz`);
      }

      await new Promise((resolve, reject) => {
        const extractor = tar.extract(folder);
        const body = toNodeReadable(res.body!);
        body.on('error', reject);
        extractor.on('error', reject);
        extractor.on('finish', resolve);
        body.pipe(extractor);
      });

      const successLog = `Initialized "${chalk.bold(
        name
      )}" example in ${chalk.bold(toHumanPath(folder))}.`;
      const folderRel = path.relative(client.cwd, folder);
      const deployHint =
        folderRel === ''
          ? listItem(`To deploy, run ${getCommandName()}.`)
          : listItem(
              `To deploy, ${cmd(
                `cd ${folderRel}`
              )} and run ${getCommandName()}.`
            );
      output.success(`${successLog}\n${deployHint}`);
      return 0;
    })
    .catch(e => {
      output.stopSpinner();
      throw e;
    });
}

/**
 * Check & prepare destination folder for extracting.
 */
function prepareFolder(cwd: string, folder: string, force?: boolean) {
  const dest = path.join(cwd, folder);

  if (fs.existsSync(dest)) {
    if (!fs.lstatSync(dest).isDirectory()) {
      throw new Error(
        `Destination path "${chalk.bold(
          folder
        )}" already exists and is not a directory.`
      );
    }
    if (!force && fs.readdirSync(dest).length !== 0) {
      throw new Error(
        `Destination path "${chalk.bold(
          folder
        )}" already exists and is not an empty directory. You may use ${cmd(
          '--force'
        )} or ${cmd('-f')} to override it.`
      );
    }
  } else if (dest !== cwd) {
    try {
      fs.mkdirSync(dest);
    } catch (e) {
      throw new Error(`Could not create directory "${chalk.bold(folder)}".`);
    }
  }

  return dest;
}

/**
 * Guess which example user try to init
 */
async function guess(client: Client, exampleList: string[], name: string) {
  const GuessError = new Error(
    `No example found for ${chalk.bold(name)}, run ${getCommandName(
      'init'
    )} to see the list of available examples.`
  );

  if (client.stdin.isTTY !== true) {
    throw GuessError;
  }

  const found = didYouMean(name, exampleList, 0.7);

  if (typeof found === 'string') {
    if (
      await client.input.confirm(`Did you mean ${chalk.bold(found)}?`, false)
    ) {
      return found;
    }
  } else {
    throw GuessError;
  }
}
