import inquirer from 'inquirer';
import text from './text';
import promptBool from './prompt-bool';
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
        `- ${chalk.bold(`${field.name}:`)} ${`${
          defaults.value
            ? defaults.value
            : chalk.italic(`${defaults.placeholder}`)
        }`}\n`
      );
    }
  }

  // create new settings object filled with "null" values
  const settings: ProjectSettings = {
    buildCommand: null,
    outputDirectory: null,
    devCommand: null,
    ...projectSettings,
  };

  const shouldOverrideSettings = await promptBool(
    `Want to override the settings? [y/N]`
  );

  if (!shouldOverrideSettings) {
    return projectSettings;
  }

  const { settingFields } = await inquirer.prompt({
    name: 'settingFields',
    type: 'checkbox',
    message: 'Which settings would you like to overwrite (select multiple)?',
    choices: fields,
  });

  for (let setting of settingFields as (keyof ProjectSettings)[]) {
    const field = fields.find(f => f.value === setting);
    settings[setting] = await text({
      label: `What's your ${field ? field.name : setting}?`,
      trailing: '\n',
    });
  }

  return settings;
}
