import confirm from './confirm';
import chalk from 'chalk';
import { frameworkList, Framework } from '@vercel/frameworks';
import Client from '../client';
import { isSettingValue } from '../is-setting-value';
import type { ProjectSettings } from '@vercel-internals/types';

const settingMap = {
  buildCommand: 'Build Command',
  devCommand: 'Development Command',
  commandForIgnoringBuildStep: 'Ignore Command',
  installCommand: 'Install Command',
  outputDirectory: 'Output Directory',
  framework: 'Framework',
} as const;
type ConfigKeys = keyof typeof settingMap;
const settingKeys = Object.keys(settingMap).sort() as unknown as readonly [
  ConfigKeys
];

export type PartialProjectSettings = Pick<ProjectSettings, ConfigKeys>;

export default async function editProjectSettings(
  client: Client,
  projectSettings: PartialProjectSettings | null,
  framework: Framework | null,
  autoConfirm: boolean,
  localConfigurationOverrides: PartialProjectSettings | null
): Promise<ProjectSettings> {
  const { output } = client;

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

  // Start UX by displaying (and applying) overrides. They will be referenced throughout remainder of CLI.
  if (localConfigurationOverrides) {
    // Apply local overrides (from `vercel.json`)
    for (const setting of settingKeys) {
      const localConfigValue = localConfigurationOverrides[setting];
      if (localConfigValue) settings[setting] = localConfigValue;
    }

    output.print('Local settings detected in vercel.json:\n');

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

    // If framework is overridden, set it to the `framework` parameter and let the normal framework-flow occur
    if (localConfigurationOverrides.framework) {
      const overrideFramework = frameworkList.find(
        f => f.slug === localConfigurationOverrides.framework
      );

      if (overrideFramework) {
        framework = overrideFramework;
        output.print(
          `Merging default Project Settings for ${framework.name}. Previously listed overrides are prioritized.\n`
        );
      }
    }
  }

  // skip editing project settings if no framework is detected
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
    if (setting === 'framework' || setting === 'commandForIgnoringBuildStep') {
      continue;
    }

    const defaultSetting = framework.settings[setting];
    const override = localConfigurationOverrides?.[setting];

    if (!override && defaultSetting) {
      output.print(
        `${chalk.dim(
          `- ${chalk.bold(`${settingMap[setting]}:`)} ${
            isSettingValue(defaultSetting)
              ? defaultSetting.value
              : chalk.italic(`${defaultSetting.placeholder}`)
          }`
        )}\n`
      );
    }
  }

  // Prompt the user if they want to modify any settings not defined by local configuration.
  if (
    autoConfirm ||
    !(await confirm(client, 'Want to modify these settings?', false))
  ) {
    return settings;
  }

  const choices = settingKeys.reduce<Array<{ name: string; value: string }>>(
    (acc, setting) => {
      const skip =
        setting === 'framework' ||
        setting === 'commandForIgnoringBuildStep' ||
        setting === 'installCommand' ||
        localConfigurationOverrides?.[setting];
      if (!skip) {
        acc.push({ name: settingMap[setting], value: setting });
      }
      return acc;
    },
    []
  );

  const settingFields = (await client.input.checkbox({
    message: 'Which settings would you like to overwrite (select multiple)?',
    choices,
  })) as ConfigKeys[];

  for (let setting of settingFields) {
    const field = settingMap[setting];
    settings[setting] = await client.input({
      message: `What's your ${chalk.bold(field)}?`,
    });
  }
  return settings;
}
