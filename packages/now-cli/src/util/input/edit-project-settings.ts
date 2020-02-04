import inquirer from 'inquirer';
import confirm from './confirm';
import chalk from 'chalk';
import { Output } from '../output';
import { Framework } from '@now/frameworks';
import { isSettingValue } from '../is-setting-value';

export interface ProjectSettings {
  buildCommand: string | null;
  outputDirectory: string | null;
  devCommand: string | null;
}

export interface ProjectSettingsWithFramework extends ProjectSettings {
  framework: string | null;
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
  // create new settings object, missing values will be filled with `null`
  const settings: Partial<ProjectSettingsWithFramework> = {
    ...projectSettings,
  };

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
      ? `No framework detected. Default project settings:\n`
      : `Auto-detected project settings (${chalk.bold(framework.name)}):\n`
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
