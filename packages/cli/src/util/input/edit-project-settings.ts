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
  readonly [k in PartialProjectSettingsFrameworkOmittedKeys]: string;
} = {
  buildCommand: 'Build Command',
  devCommand: 'Development Command',
  ignoreCommand: 'Ignore Command',
  installCommand: 'Install Command',
  outputDirectory: 'Output Directory',
};

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
      `Local configuration overrides detected. Overwritten project settings:\n`
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
    framework = (frameworks.find(
      _framework => _framework.slug === localConfigurationOverrides.framework
    ) ?? null) as Framework | null;

    if (framework) {
      output.print(
        `Merging default project settings for framework ${framework.name}. Previously listed overrides are prioritized.\n`
      );
    } else {
      output.print(
        `Framework slug matching ${localConfigurationOverrides.framework} not found.`
      );
    }
  }

  // skip editing project settings if no framework is detected and no override is provided
  if (!framework) {
    settings.framework = null;
    return settings;
  }

  // A missing framework slug implies the "Other" framework was selected
  output.print(
    !framework.slug
      ? `No framework detected. Default Project Settings:\n`
      : `Auto-detected Project Settings (${chalk.bold(framework.name)}):\n`
  );

  settings.framework = framework.slug;

  // Now print defaults for the provided framework whether it was auto-detected or overwritten
  for (const [settingValue, settingDisplayName] of Object.entries(fields)) {
    const defaults =
      framework.settings[
        settingValue as PartialProjectSettingsFrameworkOmittedKeys
      ];
    const override =
      localConfigurationOverrides?.[
        settingValue as PartialProjectSettingsFrameworkOmittedKeys
      ];

    if (defaults) {
      output.print(
        `${chalk.dim(
          `- ${chalk.bold(`${settingDisplayName}:`)} ${
            isSettingValue(defaults)
              ? defaults.value
              : chalk.italic(`${defaults.placeholder}`)
          }${
            override
              ? ` Notice: This setting is overwritten by the local configuration`
              : ''
          }`
        )}\n`
      );
    }
  }

  if (!localConfigurationOverrides) {
    if (
      autoConfirm ||
      !(await confirm(`Want to override the settings?`, false))
    ) {
      return settings;
    }

    const choices = Object.entries(fields).map(([k, v]) => ({
      name: v,
      value: k as PartialProjectSettingsFrameworkOmittedKeys,
    }));

    const { settingFields } = await inquirer.prompt<{
      settingFields: Array<PartialProjectSettingsFrameworkOmittedKeys>;
    }>({
      name: 'settingFields',
      type: 'checkbox',
      message: 'Which settings would you like to overwrite (select multiple)?',
      choices,
    });

    for (let setting of settingFields) {
      const field = fields[setting];
      const answers = await inquirer.prompt<{
        [k in PartialProjectSettingsFrameworkOmittedKeys]: string;
      }>({
        type: 'input',
        name: setting,
        message: `What's your ${chalk.bold(field)}?`,
      });
      settings[setting] = answers[setting];
    }
  }

  return settings;
}
