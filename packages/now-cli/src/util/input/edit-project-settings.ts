import inquirer from 'inquirer';
import confirm from './confirm';
import chalk from 'chalk';
import { Output } from '../output';
import { Framework } from '@vercel/frameworks';
import { isSettingValue } from '../is-setting-value';
import { ProjectSettings } from '../../types';

export interface PartialProjectSettings {
  buildCommand: string | null;
  outputDirectory: string | null;
  devCommand: string | null;
}

const fields: { name: string; value: keyof PartialProjectSettings }[] = [
  { name: 'Build Command', value: 'buildCommand' },
  { name: 'Output Directory', value: 'outputDirectory' },
  { name: 'Development Command', value: 'devCommand' },
];

export default async function editProjectSettings(
  output: Output,
  projectSettings: PartialProjectSettings | null,
  framework: Framework | null,
  autoConfirm: boolean
): Promise<ProjectSettings> {
  // create new settings object, missing values will be filled with `null`
  const settings: ProjectSettings = Object.assign(
    { framework: null },
    projectSettings
  );

  for (let field of fields) {
    settings[field.value] =
      (projectSettings && projectSettings[field.value]) || null;
  }

  // skip editing project settings if no framework is detected
  if (!framework) {
    settings.framework = null;
    return settings;
  }

  output.print(
    !framework.slug
      ? `No framework detected. Default Project Settings:\n`
      : `Auto-detected Project Settings (${chalk.bold(framework.name)}):\n`
  );

  settings.framework = framework.slug;

  for (let field of fields) {
    const defaults = framework.settings[field.value];

    output.print(
      chalk.dim(
        `- ${chalk.bold(`${field.name}:`)} ${`${
          isSettingValue(defaults)
            ? defaults.value
            : chalk.italic(`${defaults.placeholder}`)
        }`}`
      ) + '\n'
    );
  }

  if (
    autoConfirm ||
    !(await confirm(`Want to override the settings?`, false))
  ) {
    return settings;
  }

  const { settingFields } = await inquirer.prompt({
    name: 'settingFields',
    type: 'checkbox',
    message: 'Which settings would you like to overwrite (select multiple)?',
    choices: fields,
  });

  for (let setting of settingFields as (keyof PartialProjectSettings)[]) {
    const field = fields.find(f => f.value === setting);
    const name = `${Date.now()}`;
    const answers = await inquirer.prompt({
      type: 'input',
      name: name,
      message: `What's your ${chalk.bold(field ? field.name : setting)}?`,
    });
    settings[setting] = answers[name] as string;
  }

  return settings;
}
