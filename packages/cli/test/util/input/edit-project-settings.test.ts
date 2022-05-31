import { Framework, frameworks } from '@vercel/frameworks';
import editProjectSettings from '../../../src/util/input/edit-project-settings';
import { Output } from '../../../src/util/output';
import chalk from 'chalk';

let output: Output;

beforeEach(() => {
  output = new Output();
  output.print = jest.fn();
});

const nextJSFramework = frameworks[1] as unknown as Framework;

describe('editProjectSettings', () => {
  describe('with no settings, framework, or overrides provided', () => {
    test('should default all settings to `null` and not prompt user to override settings', async () => {
      // is there a better way to type `mockOutput`? editProjectSettings only ever calls output.print so its the only method we need to mock and spy on.
      const settings = await editProjectSettings(
        output,
        null,
        null,
        false,
        null
      );
      expect(settings).toStrictEqual({
        buildCommand: null,
        devCommand: null,
        framework: null,
        commandForIgnoringBuildStep: null,
        installCommand: null,
        outputDirectory: null,
      });
      expect(output.print).not.toHaveBeenCalled();
    });
  });

  describe('with settings provided, but no framework or overrides', () => {
    test('should merge provided settings with defaults and not prompt user', async () => {
      const projectSettings = {
        buildCommand: 'BUILD_COMMAND',
        devCommand: 'DEV_COMMAND',
        commandForIgnoringBuildStep: 'IGNORE_COMMAND',
        installCommand: 'INSTALL_COMMAND',
        outputDirectory: 'OUTPUT_DIRECTORY',
      };
      const settings = await editProjectSettings(
        output,
        projectSettings,
        null,
        false,
        null
      );
      expect(settings).toStrictEqual({ ...projectSettings, framework: null });
      expect(output.print).not.toHaveBeenCalled();
    });
  });

  describe('with settings and framework provided, but no overrides', () => {
    test('the settings should be returned along with the framework slug', async () => {
      const projectSettings = {
        buildCommand: 'BUILD_COMMAND',
        devCommand: 'DEV_COMMAND',
        commandForIgnoringBuildStep: 'IGNORE_COMMAND',
        installCommand: 'INSTALL_COMMAND',
        outputDirectory: 'OUTPUT_DIRECTORY',
      };
      const settings = await editProjectSettings(
        output,
        projectSettings,
        nextJSFramework,
        true,
        null
      );
      expect(output.print).toHaveBeenCalledTimes(5);
      expect(output.print).toHaveBeenNthCalledWith(
        1,
        `Auto-detected Project Settings (${chalk.bold('Next.js')}):\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        2,
        `${chalk.dim(`- ${chalk.bold('Build Command:')} next build`)}\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        3,
        `${chalk.dim(
          `- ${chalk.bold('Install Command:')} ${chalk.italic(
            '`yarn install`, `pnpm install`, or `npm install`'
          )}`
        )}\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        4,
        `${chalk.dim(
          `- ${chalk.bold('Development Command:')} next dev --port $PORT`
        )}\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        5,
        `${chalk.dim(
          `- ${chalk.bold('Output Directory:')} ${chalk.italic(
            'Next.js default'
          )}`
        )}\n`
      );
      expect(settings).toStrictEqual({
        ...projectSettings,
        framework: nextJSFramework.slug,
      });
    });
  });

  describe('with settings and framework and overrides provided', () => {
    test('overrides should be returned', async () => {
      const projectSettings = {
        buildCommand: '_BUILD_COMMAND',
        devCommand: '_DEV_COMMAND',
        commandForIgnoringBuildStep: '_IGNORE_COMMAND',
        installCommand: '_INSTALL_COMMAND',
        outputDirectory: '_OUTPUT_DIRECTORY',
      };
      const overrides = {
        buildCommand: 'BUILD_COMMAND',
        devCommand: 'DEV_COMMAND',
        ignoreCommand: 'IGNORE_COMMAND',
        installCommand: 'INSTALL_COMMAND',
        framework: 'svelte',
        outputDirectory: 'OUTPUT_DIRECTORY',
      };
      const settings = await editProjectSettings(
        output,
        projectSettings,
        nextJSFramework,
        true,
        overrides
      );
      expect(output.print).toHaveBeenCalledTimes(13);
      expect(output.print).toHaveBeenNthCalledWith(
        1,
        `Local configuration overrides detected. Overridden project settings:\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        2,
        `${chalk.dim(`- ${chalk.bold('Build Command:')} BUILD_COMMAND`)}\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        3,
        `${chalk.dim(`- ${chalk.bold('Install Command:')} INSTALL_COMMAND`)}\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        4,
        `${chalk.dim(`- ${chalk.bold('Development Command:')} DEV_COMMAND`)}\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        5,
        `${chalk.dim(`- ${chalk.bold('Ignore Command:')} IGNORE_COMMAND`)}\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        6,
        `${chalk.dim(
          `- ${chalk.bold('Output Directory:')} OUTPUT_DIRECTORY`
        )}\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        7,
        `${chalk.dim(`- ${chalk.bold('Framework:')} svelte`)}\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        8,
        'Merging default project settings for framework Svelte. Previously listed overrides are prioritized.\n'
      );
      expect(output.print).toHaveBeenNthCalledWith(
        9,
        `Auto-detected Project Settings (${chalk.bold('Svelte')}):\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        10,
        `${chalk.dim(
          `- ${chalk.bold(
            'Build Command:'
          )} rollup -c | Notice: This setting is overwritten by the local configuration`
        )}\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        11,
        `${chalk.dim(
          `- ${chalk.bold('Install Command:')} ${chalk.italic(
            '`yarn install`, `pnpm install`, or `npm install`'
          )} | Notice: This setting is overwritten by the local configuration`
        )}\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        12,
        `${chalk.dim(
          `- ${chalk.bold(
            'Development Command:'
          )} rollup -c -w | Notice: This setting is overwritten by the local configuration`
        )}\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        13,
        `${chalk.dim(
          `- ${chalk.bold(
            'Output Directory:'
          )} public | Notice: This setting is overwritten by the local configuration`
        )}\n`
      );
      const expectedResult: any = { ...overrides };
      delete expectedResult.ignoreCommand;
      expectedResult.commandForIgnoringBuildStep = overrides.ignoreCommand;
      expect(settings).toStrictEqual(expectedResult);
    });
  });

  describe('with framework and overrides provided, but no settings', () => {
    test('overrides should be returned', async () => {
      const overrides = {
        buildCommand: 'BUILD_COMMAND',
        devCommand: 'DEV_COMMAND',
        ignoreCommand: 'IGNORE_COMMAND',
        installCommand: 'INSTALL_COMMAND',
        framework: 'svelte',
        outputDirectory: 'OUTPUT_DIRECTORY',
      };
      const settings = await editProjectSettings(
        output,
        null,
        nextJSFramework,
        true,
        overrides
      );
      expect(output.print).toHaveBeenCalledTimes(13);
      expect(output.print).toHaveBeenNthCalledWith(
        1,
        `Local configuration overrides detected. Overridden project settings:\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        2,
        `${chalk.dim(`- ${chalk.bold('Build Command:')} BUILD_COMMAND`)}\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        3,
        `${chalk.dim(`- ${chalk.bold('Install Command:')} INSTALL_COMMAND`)}\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        4,
        `${chalk.dim(`- ${chalk.bold('Development Command:')} DEV_COMMAND`)}\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        5,
        `${chalk.dim(`- ${chalk.bold('Ignore Command:')} IGNORE_COMMAND`)}\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        6,
        `${chalk.dim(
          `- ${chalk.bold('Output Directory:')} OUTPUT_DIRECTORY`
        )}\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        7,
        `${chalk.dim(`- ${chalk.bold('Framework:')} svelte`)}\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        8,
        'Merging default project settings for framework Svelte. Previously listed overrides are prioritized.\n'
      );
      expect(output.print).toHaveBeenNthCalledWith(
        9,
        `Auto-detected Project Settings (${chalk.bold('Svelte')}):\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        10,
        `${chalk.dim(
          `- ${chalk.bold(
            'Build Command:'
          )} rollup -c | Notice: This setting is overwritten by the local configuration`
        )}\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        11,
        `${chalk.dim(
          `- ${chalk.bold('Install Command:')} ${chalk.italic(
            '`yarn install`, `pnpm install`, or `npm install`'
          )} | Notice: This setting is overwritten by the local configuration`
        )}\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        12,
        `${chalk.dim(
          `- ${chalk.bold(
            'Development Command:'
          )} rollup -c -w | Notice: This setting is overwritten by the local configuration`
        )}\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        13,
        `${chalk.dim(
          `- ${chalk.bold(
            'Output Directory:'
          )} public | Notice: This setting is overwritten by the local configuration`
        )}\n`
      );
      const expectedResult: any = { ...overrides };
      delete expectedResult.ignoreCommand;
      expectedResult.commandForIgnoringBuildStep = overrides.ignoreCommand;
      expect(settings).toStrictEqual(expectedResult);
    });
  });

  describe('with overrides provided, but no settings or framework', () => {
    test('overrides should be returned', async () => {
      const overrides = {
        buildCommand: 'BUILD_COMMAND',
        devCommand: 'DEV_COMMAND',
        ignoreCommand: 'IGNORE_COMMAND',
        installCommand: 'INSTALL_COMMAND',
        framework: 'svelte',
        outputDirectory: 'OUTPUT_DIRECTORY',
      };
      const settings = await editProjectSettings(
        output,
        null,
        null,
        true,
        overrides
      );
      expect(output.print).toHaveBeenCalledTimes(13);
      expect(output.print).toHaveBeenNthCalledWith(
        1,
        `Local configuration overrides detected. Overridden project settings:\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        2,
        `${chalk.dim(`- ${chalk.bold('Build Command:')} BUILD_COMMAND`)}\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        3,
        `${chalk.dim(`- ${chalk.bold('Install Command:')} INSTALL_COMMAND`)}\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        4,
        `${chalk.dim(`- ${chalk.bold('Development Command:')} DEV_COMMAND`)}\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        5,
        `${chalk.dim(`- ${chalk.bold('Ignore Command:')} IGNORE_COMMAND`)}\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        6,
        `${chalk.dim(
          `- ${chalk.bold('Output Directory:')} OUTPUT_DIRECTORY`
        )}\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        7,
        `${chalk.dim(`- ${chalk.bold('Framework:')} svelte`)}\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        8,
        'Merging default project settings for framework Svelte. Previously listed overrides are prioritized.\n'
      );
      expect(output.print).toHaveBeenNthCalledWith(
        9,
        `Auto-detected Project Settings (${chalk.bold('Svelte')}):\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        10,
        `${chalk.dim(
          `- ${chalk.bold(
            'Build Command:'
          )} rollup -c | Notice: This setting is overwritten by the local configuration`
        )}\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        11,
        `${chalk.dim(
          `- ${chalk.bold('Install Command:')} ${chalk.italic(
            '`yarn install`, `pnpm install`, or `npm install`'
          )} | Notice: This setting is overwritten by the local configuration`
        )}\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        12,
        `${chalk.dim(
          `- ${chalk.bold(
            'Development Command:'
          )} rollup -c -w | Notice: This setting is overwritten by the local configuration`
        )}\n`
      );
      expect(output.print).toHaveBeenNthCalledWith(
        13,
        `${chalk.dim(
          `- ${chalk.bold(
            'Output Directory:'
          )} public | Notice: This setting is overwritten by the local configuration`
        )}\n`
      );
      const expectedResult: any = { ...overrides };
      delete expectedResult.ignoreCommand;
      expectedResult.commandForIgnoringBuildStep = overrides.ignoreCommand;
      expect(settings).toStrictEqual(expectedResult);
    });
  });
});
