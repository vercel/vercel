import chalk from 'chalk';
import mri from 'mri';
import tar from 'tar-fs';
import fetch from 'node-fetch';

import { handleError } from '../util/error';
import listInput from '../util/input/list';
import promptBool from '../util/input/prompt-bool';
import success from '../util/output/success';
import error from '../util/output/error';
import wait from '../util/output/wait';
import logo from '../util/output/logo';
import info from '../util/output/info';
import exit from '../util/exit';

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now init`)} [example]

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')}  Initialize example project in current directory

      ${chalk.cyan(`$ now init <example>`)}

  ${chalk.gray('–')}  Choose from all available examples

      ${chalk.cyan(`$ now init`)}
  `);
};

export default async ctx => {
  try {
    return await main(ctx);
  } catch (err) {
    handleError(err);
    return 1;
  }
};

const main = async ctx => {
  const argv = mri(ctx.argv.slice(2), {
    boolean: ['help', 'debug'],
    alias: {
      help: 'h',
      debug: 'd'
    }
  });

  const debug = argv.debug;

  if (argv.help) {
    help();
    await exit(0);
  }

  return run({ argv, debug });
};

async function run({ argv }) {
  const [, name] = argv._;

  const examples = await fetchExamples();

  if (!examples) return 1;

  try {
    if (!name) {
      return await chooseExample(examples);
    }

    if (examples.includes(name)) {
      return await initExample(name);
    }

    return await guess(examples, name);
  } catch (e) {
    console.log(e, error(`Failed initialize examples.`));
    return 1;
  }
}

/**
 * Fetch example list json
 */
async function fetchExamples () {
  const stopSpinner = wait('Fetching examples');
  const url = 'https://now-example-files.now.sh/list.json';

  try {
    const resp = await fetch(url);
    stopSpinner();

    if (resp.status !== 200) {
      throw new Error(`${resp.statusText} ${url}`);
    }

    return resp.json();
  } catch (e) {
    stopSpinner();
    console.log(error('Cannot get example list.'));
  }
}

/**
 * Choose an example from list to initialize
 * @param {Array} examples Example list
 */
async function chooseExample(examples) {
  const choice = await chooseFromDropdown(examples);

  if (choice) {
    return initExample(choice);
  }

  console.log(info('No changes made'));
  return 0;
}

/**
 * Prompt user for choosing which example to init
 * @param {Array} examples Example list
 */
async function chooseFromDropdown(examples) {
  const choices = examples.map(name => ({
    name,
    value: name,
    short: name
  }));

  return listInput({
    message: 'Select example:',
    choices,
    separator: false,
    abort: 'end'
  });
}

/**
 * Init example in current directory
 * @param {String} name Example name
 */
async function initExample(name) {
  let resp;

  const stopSpinner = wait(`Fetching ${name}`);

  try {
    const url = `https://now-example-files.now.sh/download/${name}.tar.gz`;
    resp = await fetch(url);
    stopSpinner();
  } catch (e) {
    stopSpinner();
  }

  await new Promise((resolve, reject) => {
    const extractor = tar.extract(); // Extract to current directory
    resp.body.on('error', reject);
    extractor.on('error', reject);
    extractor.on('finish', resolve);
    resp.body.pipe(extractor);
  });

  console.log(success(`Initialized "${name}" example.`));

  return 0;
}

/**
 * Guess which example user try to init
 * @param {Array} examples Avaliable examples
 * @param {String} input User's request
 */
async function guess (examples, input) {
  // simple guess rules
  const found = examples.find(ex =>
      ex.startsWith(input)
    ) || examples.find(ex => ex.includes(input));

  if (found) {
    if(await promptBool(`Initialize with ${chalk.bold(found)}?`)) {
      return initExample(found);
    }
  } else {
    console.log(info(`No example for ${chalk.bold(input)}`));
  }

  return 0;
}
