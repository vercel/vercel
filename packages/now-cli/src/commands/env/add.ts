import chalk from 'chalk';
import inquirer from 'inquirer';
import { ProjectEnvTarget, Project, Secret, ProjectEnvType } from '../../types';
import { Output } from '../../util/output';
import Client from '../../util/client';
import stamp from '../../util/output/stamp';
import addEnvRecord from '../../util/env/add-env-record';
import getEnvVariables from '../../util/env/get-env-records';
import {
  isValidEnvTarget,
  getEnvTargetPlaceholder,
  getEnvTargetChoices,
} from '../../util/env/env-target';
import { isValidEnvType, getEnvTypePlaceholder } from '../../util/env/env-type';
import readStandardInput from '../../util/input/read-standard-input';
import param from '../../util/output/param';
import withSpinner from '../../util/with-spinner';
import { emoji, prependEmoji } from '../../util/emoji';
import { isKnownError } from '../../util/env/known-error';
import { getCommandName } from '../../util/pkg-name';
import { SYSTEM_ENV_VALUES } from '../../util/env/system-env';

type Options = {
  '--debug': boolean;
};

export default async function add(
  client: Client,
  project: Project,
  opts: Options,
  args: string[],
  output: Output
) {
  // improve the way we show inquirer prompts
  require('../../util/input/patch-inquirer');

  const stdInput = await readStandardInput();
  let [envType, envName, envTarget] = args;

  if (args.length > 3) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(
        `env add ${getEnvTypePlaceholder()} <name> ${getEnvTargetPlaceholder()}`
      )}`
    );
    return 1;
  }

  if (stdInput && (!envType || !envName || !envTarget)) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(
        `env add ${getEnvTypePlaceholder()} <name> <target> < <file>`
      )}`
    );
    return 1;
  }

  let envTargets: ProjectEnvTarget[] = [];
  if (envTarget) {
    if (!isValidEnvTarget(envTarget)) {
      output.error(
        `The Environment ${param(
          envTarget
        )} is invalid. It must be one of: ${getEnvTargetPlaceholder()}.`
      );
      return 1;
    }
    envTargets.push(envTarget);
  }

  if (envType && !isValidEnvType(envType)) {
    output.error(
      `The Environment Variable type ${param(
        envType
      )} is invalid. It must be one of: ${getEnvTypePlaceholder()}.`
    );
    return 1;
  }

  if (!envType) {
    const { inputEnvType } = (await inquirer.prompt({
      name: 'inputEnvType',
      type: 'list',
      message: `Which type of Environment Variable do you want to add?`,
      choices: [
        { name: 'Plaintext', value: ProjectEnvType.Plaintext },
        {
          name: `Secret (can be created using ${getCommandName('secret add')})`,
          value: ProjectEnvType.Secret,
        },
        { name: 'Provided by System', value: ProjectEnvType.System },
      ],
    })) as { inputEnvType: ProjectEnvType };

    envType = inputEnvType;
  }

  while (!envName) {
    const { inputName } = await inquirer.prompt({
      type: 'input',
      name: 'inputName',
      message: `What’s the name of the variable?`,
    });

    envName = inputName;

    if (!inputName) {
      output.error('Name cannot be empty');
    }
  }

  const { envs } = await getEnvVariables(output, client, project.id);
  const existing = new Set(
    envs.filter(r => r.key === envName).map(r => r.target)
  );
  const choices = getEnvTargetChoices().filter(c => !existing.has(c.value));

  if (choices.length === 0) {
    output.error(
      `The variable ${param(
        envName
      )} has already been added to all Environments. To remove, run ${getCommandName(
        `env rm ${envName}`
      )}.`
    );
    return 1;
  }

  let envValue: string;

  if (stdInput) {
    envValue = stdInput;
  } else if (envType === ProjectEnvType.Plaintext) {
    const { inputValue } = await inquirer.prompt({
      type: 'input',
      name: 'inputValue',
      message: `What’s the value of ${envName}?`,
    });

    envValue = inputValue || '';
  } else if (envType === ProjectEnvType.Secret) {
    let secretId: string | null = null;

    while (!secretId) {
      let { secretName } = await inquirer.prompt({
        type: 'input',
        name: 'secretName',
        message: `What’s the value of ${envName}?`,
      });

      secretName = secretName || '';

      if (secretName[0] === '@') {
        secretName = secretName.slice(1);
      }

      try {
        const secret = await client.fetch<Secret>(
          `/v2/now/secrets/${encodeURIComponent(secretName)}`
        );

        secretId = secret.uid;
      } catch (error) {
        if (error.status === 404) {
          output.error(
            `Please enter the name of an existing Secret (can be created with ${getCommandName(
              'secret add'
            )}).`
          );
        } else {
          throw error;
        }
      }
    }

    envValue = secretId;
  } else {
    const { systemEnvValue } = await inquirer.prompt({
      name: 'systemEnvValue',
      type: 'list',
      message: `What’s the value of ${envName}?`,
      choices: SYSTEM_ENV_VALUES.map(value => ({ name: value, value })),
    });

    envValue = systemEnvValue;
  }

  while (envTargets.length === 0) {
    const { inputTargets } = await inquirer.prompt({
      name: 'inputTargets',
      type: 'checkbox',
      message: `Add ${envName} to which Environments (select multiple)?`,
      choices,
    });

    envTargets = inputTargets;

    if (inputTargets.length === 0) {
      output.error('Please select at least one Environment');
    }
  }

  const addStamp = stamp();
  try {
    await withSpinner('Saving', () =>
      addEnvRecord(
        output,
        client,
        project.id,
        // @ts-ignore
        envType,
        envName,
        envValue,
        envTargets
      )
    );
  } catch (error) {
    if (isKnownError(error) && error.serverMessage) {
      output.error(error.serverMessage);
      return 1;
    }
    throw error;
  }

  output.print(
    `${prependEmoji(
      `Added Environment Variable ${chalk.bold(
        envName
      )} to Project ${chalk.bold(project.name)} ${chalk.gray(addStamp())}`,
      emoji('success')
    )}\n`
  );

  return 0;
}
