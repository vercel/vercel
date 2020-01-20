import inquirer from 'inquirer';
import confirm from './confirm';
import chalk from 'chalk';
import { Output } from '../output';
import { Framework, SettingValue } from '@now/frameworks';

export interface ProjectSettings {
  buildCommand: string | null;
  outputDirectory: string | null;
  devCommand: string | null;
}

const fields: { name: string; value: keyof ProjectSettings }[] = [
  { name: 'Build Command', value: 'buildCommand' },
  { name: 'Output Directory', value: 'outputDirectory' },
  { name: 'Development Command', value: 'devCommand' },
];

function isSettingValue(setting: any): setting is SettingValue {
  return setting && typeof setting.value === 'string';
}

export default async function editProjectSettings(
  output: Output,
  projectSettings: ProjectSettings | null,
  framework: Framework | null
) {
  // create new settings object filled with "null" values
  const settings: Partial<ProjectSettings> = {};

  for (let field of fields) {
    settings[field.value] =
      (projectSettings && projectSettings[field.value]) || null;
  }

  if (!framework) {
    return settings;
  }

  output.print(
    `Auto-detected project settings (${chalk.bold(framework.name)}):\n`
  );

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

  if (!(await confirm(`Want to override the settings?`, false))) {
    return settings;
  }

  const { settingFields } = await inquirer.prompt({
    name: 'settingFields',
    type: 'checkbox',
    message: 'Which settings would you like to overwrite (select multiple)?',
    choices: fields,
  });

  for (let setting of settingFields as (keyof ProjectSettings)[]) {
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
