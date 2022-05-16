import inquirer from 'inquirer';
import confirm from './confirm';
import chalk from 'chalk';
import { Output } from '../output';
import { Framework, frameworks } from '@vercel/frameworks';
import { isSettingValue } from '../is-setting-value';
import { ProjectSettings } from '../../types';
import { VercelConfig } from '../dev/types';

export type PartialProjectSettings = Pick<
  VercelConfig,
  | 'buildCommand'
  | 'installCommand'
  | 'devCommand'
  | 'ignoreCommand'
  | 'outputDirectory'
  | 'framework'
>;
type PartialProjectSettingsKeys = keyof Required<PartialProjectSettings>;
type PartialProjectSettingsFrameworkOmitted = Omit<
  PartialProjectSettings,
  'framework'
>;
type PartialProjectSettingsFrameworkOmittedKeys =
  keyof Required<PartialProjectSettingsFrameworkOmitted>;
const fields: {
  [k in PartialProjectSettingsFrameworkOmittedKeys]: string;
} = {
  buildCommand: 'Build Command',
  devCommand: 'Development Command',
  ignoreCommand: 'Ignore Command',
  installCommand: 'Install Command',
  outputDirectory: 'Output Directory',
} as const;

export default async function editProjectSettings(
  output: Output,
  projectSettings: PartialProjectSettingsFrameworkOmitted | null,
  framework: Framework | null,
  autoConfirm: boolean,
  localConfigurationOverrides: PartialProjectSettings | null
): Promise<ProjectSettings> {
  // Create initial settings object defaulting everything to `null` and assigning what may exist in `projectSettings`
  const settings: ProjectSettings = Object.assign(
    {
      buildCommand: null,
      devCommand: null,
      framework: null,
      ignoreCommand: null,
      installCommand: null,
      outputDirectory: null,
    },
    projectSettings
  );

  // Start UX by displaying overrides. They will be referenced throughout remainder of CLI.
  if (localConfigurationOverrides) {
    // Apply local overrides (from `vercel.json`)
    Object.assign(settings, localConfigurationOverrides);

    output.print(
      `Local configuration override detected. Overwritten project settings:\n`
    );

    // Print provided overrides including framework
    for (const [settingValue, settingDisplayName] of Object.entries(
      fields
    ).concat(['framework', 'Framework'])) {
      const override =
        localConfigurationOverrides?.[
          settingValue as PartialProjectSettingsKeys
        ];
      if (override) {
        output.print(
          `${chalk.dim(
            `- ${chalk.bold(`${settingDisplayName}:`)} ${override}`
          )}\n`
        );
      }
    }
  }

  // Apply local framework override
  if (localConfigurationOverrides?.framework) {
    // Unfortunately the frameworks map is a readonly constant and does not actually return `Framework` type objects
    framework =
      (frameworks.find(
        _framework => _framework.slug === localConfigurationOverrides.framework
      ) as Framework) ?? null;

    output.print(
      `Merging default project settings for framework ${framework.name}. Previously listed overrides are prioritized.\n`
    );
  }

  // skip editing project settings if no framework is detected and no override is provided
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

  // Now print defaults for the provided framework whether it was auto-detected or overwritten
  for (const [value, name] of Object.entries(fields)) {
    const defaults =
      framework.settings[value as PartialProjectSettingsFrameworkOmittedKeys];

    // TODO (@ethan-arrowood) - If user provided a command override we should indicate to the user in this line that
    // even tho a default exists for the framework, the override is being used instead.
    if (defaults) {
      output.print(
        chalk.dim(
          `- ${chalk.bold(`${name}:`)} ${`${
            isSettingValue(defaults)
              ? defaults.value
              : chalk.italic(`${defaults.placeholder}`)
          }`}`
        ) + '\n'
      );
    }
  }

  // @ethan continue from here

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
