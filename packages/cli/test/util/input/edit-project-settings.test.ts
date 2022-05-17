import { Framework, frameworks } from '@vercel/frameworks';
import editProjectSettings from '../../../src/util/input/edit-project-settings';
import { Output } from '../../../src/util/output';

let output: Output;

beforeEach(() => {
  output = new Output();
  output.print = jest.fn();
});

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
        ignoreCommand: null,
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
        ignoreCommand: 'IGNORE_COMMAND',
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
    test('', async () => {
      const projectSettings = {
        buildCommand: 'BUILD_COMMAND',
        devCommand: 'DEV_COMMAND',
        ignoreCommand: 'IGNORE_COMMAND',
        installCommand: 'INSTALL_COMMAND',
        outputDirectory: 'OUTPUT_DIRECTORY',
      };
      const framework = frameworks[1] as unknown as Framework;
      const settings = await editProjectSettings(
        output,
        projectSettings,
        framework,
        true,
        null
      );
      expect(output.print).toHaveBeenCalledTimes(5);
      expect(settings).toStrictEqual({
        ...projectSettings,
        framework: framework.slug,
      });
    });
  });
});
