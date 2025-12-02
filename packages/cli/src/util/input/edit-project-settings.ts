import chalk from 'chalk';
import { frameworkList, type Framework } from '@vercel/frameworks';
import type { Runtime } from '@vercel/frameworks';
import type Client from '../client';
import { isSettingValue } from '../is-setting-value';
import type { ProjectSettings } from '@vercel-internals/types';
import output from '../../output-manager';

const settingMap = {
  buildCommand: 'Build Command',
  devCommand: 'Development Command',
  commandForIgnoringBuildStep: 'Ignore Command',
  installCommand: 'Install Command',
  outputDirectory: 'Output Directory',
  framework: 'Framework',
  runtime: 'Runtime',
} as const;
type ConfigKeys = keyof typeof settingMap;
const settingKeys = Object.keys(settingMap).sort() as unknown as readonly [
  ConfigKeys,
];

export type PartialProjectSettings = Pick<ProjectSettings, ConfigKeys>;

export async function editProjectSettings(
  client: Client,
  projectSettings: PartialProjectSettings | null,
  framework: Framework | null,
  autoConfirm: boolean,
  localConfigurationOverrides: PartialProjectSettings | null,
  runtime: Runtime | null = null
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

  const hasLocalConfigurationOverrides =
    localConfigurationOverrides &&
    Object.values(localConfigurationOverrides ?? {}).some(Boolean);

  // Start UX by displaying (and applying) overrides. They will be referenced throughout remainder of CLI.
  if (hasLocalConfigurationOverrides) {
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

  // If a runtime was auto-detected and not already configured (for example via
  // existing project settings or local overrides), assign it now.
  if (runtime?.slug && !settings.runtime) {
    settings.runtime = runtime.slug;
  }

  // skip editing project settings if no framework is detected
  if (!framework) {
    settings.framework = null;
    return settings;
  }

  const styledFramework = (frameworkName: string) => {
    const frameworkStyle = {
      text: frameworkName,
      color: chalk.blue,
    };

    if (frameworkName === 'Hono') {
      frameworkStyle.text = '🔥 Hono';
      frameworkStyle.color = chalk.hex('#FFA500');
    }

    return chalk.bold(frameworkStyle.color(frameworkStyle.text));
  };

  // A missing framework slug implies the "Other" framework was selected
  output.print(
    !framework.slug
      ? `No framework detected. Default Project Settings:\n`
      : `Auto-detected Project Settings (${styledFramework(framework.name)}):\n`
  );

  settings.framework = framework.slug;

  // When using the "Other" framework, surface the detected runtime (if any)
  // so the user understands how their project will be executed.
  if (!framework.slug && settings.runtime) {
    const runtimeLabel = runtime?.name ?? settings.runtime;
    output.print(
      `${chalk.dim(`- ${chalk.bold('Runtime:')} ${runtimeLabel}`)}\n`
    );
  }

  // Now print defaults for the provided framework whether it was auto-detected or overwritten.
  // When using the "Other" framework with a detected runtime, prefer the runtime
  // defaults over the generic "Other" framework defaults.
  const defaults =
    !framework.slug && runtime ? runtime.settings : framework.settings;

  for (const setting of settingKeys) {
    if (
      setting === 'framework' ||
      setting === 'commandForIgnoringBuildStep' ||
      setting === 'runtime'
    ) {
      continue;
    }

    const defaultSetting = defaults[setting];
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
    !(await client.input.confirm('Want to modify these settings?', false))
  ) {
    return settings;
  }

  const choices = settingKeys.reduce(
    (acc, setting) => {
      const skip =
        setting === 'framework' ||
        setting === 'commandForIgnoringBuildStep' ||
        setting === 'installCommand' ||
        localConfigurationOverrides?.[setting];
      if (skip) return acc;
      return [...acc, { name: settingMap[setting], value: setting }];
    },
    [] as { name: string; value: ConfigKeys }[]
  );

  const settingFields = await client.input.checkbox({
    message: 'Which settings would you like to overwrite (select multiple)?',
    choices,
  });

  for (const setting of settingFields) {
    const field = settingMap[setting];
    settings[setting] = await client.input.text({
      message: `What's your ${chalk.bold(field)}?`,
    });
  }
  return settings;
}
