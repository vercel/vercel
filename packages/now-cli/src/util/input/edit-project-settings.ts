import inquirer from 'inquirer';
import confirm from './confirm';
import chalk from 'chalk';
import { Output } from '../output';
import { Framework } from '@now/frameworks';

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

export default async function editProjectSettings(
  output: Output,
  projectSettings: ProjectSettings | null,
  framework: Framework | null
) {
  if (framework) {
    output.print(`Auto-detected ${chalk.bold(framework.name)} settings:\n`);

    for (let field of fields) {
      const defaults = framework.settings[field.value];

      output.print(
        chalk.gray(
          `- ${chalk.bold(`${field.name}:`)} ${`${
            defaults.value
              ? defaults.value
              : chalk.italic(`${defaults.placeholder}`)
          }`}`
        ) + '\n'
      );
    }
  }

  // create new settings object filled with "null" values
  const settings: Partial<ProjectSettings> = {};

  for (let field of fields) {
    settings[field.value] =
      (projectSettings && projectSettings[field.value]) || null;
  }

  const shouldOverrideSettings = await confirm(
    `Want to override the settings?`,
    false
  );

  if (!shouldOverrideSettings) {
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
