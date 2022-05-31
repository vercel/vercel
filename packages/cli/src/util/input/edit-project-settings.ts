import inquirer from 'inquirer';
import confirm from './confirm';
import chalk from 'chalk';
import { Output } from '../output';
import { Framework, frameworks } from '@vercel/frameworks';
import { isSettingValue } from '../is-setting-value';
import { ProjectSettings } from '../../types';
import { VercelConfig } from '../dev/types';

const settingKeys = [
  'buildCommand',
  'installCommand',
  'devCommand',
  'ignoreCommand',
  'outputDirectory',
  'framework',
] as const;
const settingMap = {
  buildCommand: 'Build Command',
  devCommand: 'Development Command',
  ignoreCommand: 'Ignore Command',
  installCommand: 'Install Command',
  outputDirectory: 'Output Directory',
  framework: 'Framework',
} as const;

type ConfigKeys = typeof settingKeys[number];
type ProjectSettingKeys =
  | Exclude<ConfigKeys, 'ignoreCommand'>
  | 'commandForIgnoringBuildStep';
type PartialProjectSettings = Pick<ProjectSettings, ProjectSettingKeys>;

type LocalConfiguration = Pick<
  VercelConfig,
  | keyof Omit<PartialProjectSettings, 'commandForIgnoringBuildStep'>
  | 'ignoreCommand'
>;

/** A quick transform for 'ignoreCommand' to 'commandForIgnoringBuildStep' as they are the only key
 * that differs between the top level vercel.json configuration settings and the api `projectSettings` object.
 */
const normalizeSettingName = (setting: typeof settingKeys[number]) =>
  setting === 'ignoreCommand' ? 'commandForIgnoringBuildStep' : setting;

export default async function editProjectSettings(
  output: Output,
  projectSettings: PartialProjectSettings | null,
  framework: Framework | null,
  autoConfirm: boolean,
  localConfigurationOverrides: LocalConfiguration | null
): Promise<ProjectSettings> {
  // Create initial settings object defaulting everything to `null` and assigning what may exist in `projectSettings`
  const settings: ProjectSettings = Object.assign(
    {
      buildCommand: null,
      devCommand: null,
      framework: null,
      commandForIgnoringBuildStep: null,
      installCommand: null,
      outputDirectory: null,
    },
    projectSettings
  );

  // Start UX by displaying overrides. They will be referenced throughout remainder of CLI.
  if (localConfigurationOverrides) {
    // Apply local overrides (from `vercel.json`)
    for (const setting of settingKeys) {
      const localConfigValue = localConfigurationOverrides[setting];
      if (localConfigValue)
        settings[normalizeSettingName(setting)] = localConfigValue;
    }

    output.print(
      `Local configuration overrides detected. Overridden project settings:\n`
    );

    // Print provided overrides including framework
    for (const setting of settingKeys) {
      const override = localConfigurationOverrides[setting];
      if (override) {
        output.print(
          `${chalk.dim(
            `- ${chalk.bold(`${settingMap[setting]}:`)} ${override}`
          )}\n`
        );
      }
    }

    // Apply local framework override
    if (localConfigurationOverrides.framework) {
      // Unfortunately the frameworks map is a readonly constant and does not actually return `Framework` type objects
      framework = (frameworks.find(
        _framework => _framework.slug === localConfigurationOverrides.framework
      ) ?? null) as Framework | null;

      if (framework) {
        output.print(
          `Merging default project settings for framework ${framework.name}. Previously listed overrides are prioritized.\n`
        );
      }
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
  for (const setting of settingKeys) {
    if (setting === 'framework') continue;

    const defaults = framework.settings[setting];
    const override = localConfigurationOverrides?.[setting];

    if (defaults) {
      output.print(
        `${chalk.dim(
          `- ${chalk.bold(`${settingMap[setting]}:`)} ${
            isSettingValue(defaults)
              ? defaults.value
              : chalk.italic(`${defaults.placeholder}`)
          }${
            override
              ? ' | Notice: This setting is overwritten by the local configuration'
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

    const choices = settingKeys.reduce<Array<{ name: string; value: string }>>(
      (acc, key) => {
        if (key === 'framework') return acc; // skip overriding framework
        acc.push({ name: settingMap[key], value: key });
        return acc;
      },
      []
    );

    const { settingFields } = await inquirer.prompt<{
      settingFields: Array<Exclude<ConfigKeys, 'framework'>>;
    }>({
      name: 'settingFields',
      type: 'checkbox',
      message: 'Which settings would you like to overwrite (select multiple)?',
      choices,
    });

    for (let setting of settingFields) {
      const normalized = normalizeSettingName(setting);
      const field = settingMap[setting];
      const answers = await inquirer.prompt<{
        [k in Exclude<ConfigKeys, 'framework'>]: string;
      }>({
        type: 'input',
        name: setting,
        message: `What's your ${chalk.bold(field)}?`,
      });
      settings[normalized] = answers[setting];
    }
  }

  return settings;
}
