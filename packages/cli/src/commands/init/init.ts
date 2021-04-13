import fs from 'fs';
import path from 'path';
import tar from 'tar-fs';
import chalk from 'chalk';
import fetch from 'node-fetch';

// @ts-ignore
import listInput from '../../util/input/list';
import listItem from '../../util/output/list-item';
import promptBool from '../../util/input/prompt-bool';
import toHumanPath from '../../util/humanize-path';
import { Output } from '../../util/output';
import Client from '../../util/client';
import success from '../../util/output/success';
import info from '../../util/output/info';
import cmd from '../../util/output/cmd';
import didYouMean from '../../util/init/did-you-mean';
import { getCommandName } from '../../util/pkg-name';

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

const EXAMPLE_API = 'https://now-example-files.zeit.sh';

export default async function init(
  client: Client,
  opts: Partial<Options>,
  args: string[]
) {
  const { output } = client;
  const [name, dir] = args;
  const force = opts['-f'] || opts['--force'];

  const examples = await fetchExampleList(output);

  if (!examples) {
    throw new Error(`Could not fetch example list.`);
  }

  const exampleList = examples.filter(x => x.visible).map(x => x.name);

  if (!name) {
    const chosen = await chooseFromDropdown('Select example:', exampleList);

    if (!chosen) {
      output.log('Aborted');
      return 0;
    }

    return extractExample(output, chosen, dir, force);
  }

  if (exampleList.includes(name)) {
    return extractExample(output, name, dir, force);
  }

  const oldExample = examples.find(x => !x.visible && x.name === name);
  if (oldExample) {
    return extractExample(output, name, dir, force, 'v1');
  }

  const found = await guess(exampleList, name);

  if (typeof found === 'string') {
    return extractExample(output, found, dir, force);
  }

  console.log(info('No changes made.'));
  return 0;
}

/**
 * Fetch example list json
 */
async function fetchExampleList(output: Output) {
  output.spinner('Fetching examples');
  const url = `${EXAMPLE_API}/v2/list.json`;

  try {
    const resp = await fetch(url);
    output.stopSpinner();

    if (resp.status !== 200) {
      throw new Error(`Failed fetching list.json (${resp.statusText}).`);
    }

    return (await resp.json()) as Example[];
  } catch (e) {
    output.stopSpinner();
  }
}

/**
 * Prompt user for choosing which example to init
 */
async function chooseFromDropdown(message: string, exampleList: string[]) {
  const choices = exampleList.map(name => ({
    name,
    value: name,
    short: name,
  }));

  return listInput({
    message,
    separator: false,
    choices,
  });
}

/**
 * Extract example to directory
 */
async function extractExample(
  output: Output,
  name: string,
  dir: string,
  force?: boolean,
  ver: string = 'v2'
) {
  const folder = prepareFolder(process.cwd(), dir || name, force);
  output.spinner(`Fetching ${name}`);

  const url = `${EXAMPLE_API}/${ver}/download/${name}.tar.gz`;

  return fetch(url)
    .then(async resp => {
      output.stopSpinner();

      if (resp.status !== 200) {
        throw new Error(`Could not get ${name}.tar.gz`);
      }

      await new Promise((resolve, reject) => {
        const extractor = tar.extract(folder);
        resp.body.on('error', reject);
        extractor.on('error', reject);
        extractor.on('finish', resolve);
        resp.body.pipe(extractor);
      });

      const successLog = `Initialized "${chalk.bold(
        name
      )}" example in ${chalk.bold(toHumanPath(folder))}.`;
      const folderRel = path.relative(process.cwd(), folder);
      const deployHint =
        folderRel === ''
          ? listItem(`To deploy, run ${getCommandName()}.`)
          : listItem(
              `To deploy, ${cmd(
                `cd ${folderRel}`
              )} and run ${getCommandName()}.`
            );
      console.log(success(`${successLog}\n${deployHint}`));
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
async function guess(exampleList: string[], name: string) {
  const GuessError = new Error(
    `No example found for ${chalk.bold(name)}, run ${getCommandName(
      `init`
    )} to see the list of available examples.`
  );

  if (process.stdout.isTTY !== true) {
    throw GuessError;
  }

  const found = didYouMean(name, exampleList, 0.7);

  if (typeof found === 'string') {
    if (await promptBool(`Did you mean ${chalk.bold(found)}?`)) {
      return found;
    }
  } else {
    throw GuessError;
  }
}
