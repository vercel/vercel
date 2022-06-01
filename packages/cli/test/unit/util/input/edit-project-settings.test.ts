import { Framework, frameworks } from '@vercel/frameworks';
import editProjectSettings from '../../../../src/util/input/edit-project-settings';
import { Output } from '../../../../src/util/output';

let output: Output;

beforeEach(() => {
  output = new Output();
  output.print = jest.fn();
});

const otherFramework = frameworks.find(
  fwk => fwk.name === 'Other'
) as unknown as Framework;
const nextJSFramework = frameworks.find(
  fwk => fwk.slug === 'nextjs'
) as unknown as Framework;

describe('editProjectSettings', () => {
  describe('with no settings, "Other" framework, and no overrides provided', () => {
    test('should default all settings to `null` and print user default framework settings', async () => {
      const settings = await editProjectSettings(
        output,
        null,
        otherFramework,
        true,
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
      expect((output.print as jest.Mock).mock.calls.length).toBe(5);
      expect((output.print as jest.Mock).mock.calls[0][0]).toMatch(
        /No framework detected. Default Project Settings:/
      );
      expect((output.print as jest.Mock).mock.calls[1][0]).toMatch(
        /Build Command/
      );
      expect((output.print as jest.Mock).mock.calls[2][0]).toMatch(
        /Install Command/
      );
      expect((output.print as jest.Mock).mock.calls[3][0]).toMatch(
        /Development Command/
      );
      expect((output.print as jest.Mock).mock.calls[4][0]).toMatch(
        /Output Directory/
      );
    });
  });

  describe('with settings provided, "Other" framework, and no overrides', () => {
    test('should merge provided settings with defaults and not print to user about overrides', async () => {
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
        otherFramework,
        true,
        null
      );
      expect(settings).toStrictEqual({ ...projectSettings, framework: null });
      expect((output.print as jest.Mock).mock.calls.length).toBe(5);
      expect((output.print as jest.Mock).mock.calls[0][0]).toMatch(
        /No framework detected. Default Project Settings:/
      );
      expect((output.print as jest.Mock).mock.calls[1][0]).toMatch(
        /Build Command/
      );
      expect((output.print as jest.Mock).mock.calls[2][0]).toMatch(
        /Install Command/
      );
      expect((output.print as jest.Mock).mock.calls[3][0]).toMatch(
        /Development Command/
      );
      expect((output.print as jest.Mock).mock.calls[4][0]).toMatch(
        /Output Directory/
      );
    });
  });

  describe('with settings and Next.js framework provided, but no overrides', () => {
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
      expect((output.print as jest.Mock).mock.calls.length).toBe(5);
      expect((output.print as jest.Mock).mock.calls[0][0]).toMatch(
        /Auto-detected Project Settings/
      );
      expect((output.print as jest.Mock).mock.calls[1][0]).toMatch(
        /Build Command/
      );
      expect((output.print as jest.Mock).mock.calls[2][0]).toMatch(
        /Install Command/
      );
      expect((output.print as jest.Mock).mock.calls[3][0]).toMatch(
        /Development Command/
      );
      expect((output.print as jest.Mock).mock.calls[4][0]).toMatch(
        /Output Directory/
      );
      expect(settings).toStrictEqual({
        ...projectSettings,
        framework: nextJSFramework.slug,
      });
    });
  });

  describe('with settings and Next.js framework and overrides provided', () => {
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
      expect((output.print as jest.Mock).mock.calls.length).toBe(9);
      expect((output.print as jest.Mock).mock.calls[0][0]).toMatch(
        /Local settings detected in vercel.json:/
      );
      expect((output.print as jest.Mock).mock.calls[1][0]).toMatch(
        /Build Command:/
      );
      expect((output.print as jest.Mock).mock.calls[2][0]).toMatch(
        /Install Command:/
      );
      expect((output.print as jest.Mock).mock.calls[3][0]).toMatch(
        /Development Command:/
      );
      expect((output.print as jest.Mock).mock.calls[4][0]).toMatch(
        /Ignore Command:/
      );
      expect((output.print as jest.Mock).mock.calls[5][0]).toMatch(
        /Output Directory:/
      );
      expect((output.print as jest.Mock).mock.calls[6][0]).toMatch(
        /Framework:/
      );
      expect((output.print as jest.Mock).mock.calls[7][0]).toMatch(
        /Merging default project settings for framework Svelte. Previously listed overrides are prioritized./
      );
      expect((output.print as jest.Mock).mock.calls[8][0]).toMatch(
        /Auto-detected Project Settings/
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
      expect((output.print as jest.Mock).mock.calls.length).toBe(9);
      expect((output.print as jest.Mock).mock.calls[0][0]).toMatch(
        /Local settings detected in vercel.json:/
      );
      expect((output.print as jest.Mock).mock.calls[1][0]).toMatch(
        /Build Command:/
      );
      expect((output.print as jest.Mock).mock.calls[2][0]).toMatch(
        /Install Command:/
      );
      expect((output.print as jest.Mock).mock.calls[3][0]).toMatch(
        /Development Command:/
      );
      expect((output.print as jest.Mock).mock.calls[4][0]).toMatch(
        /Ignore Command:/
      );
      expect((output.print as jest.Mock).mock.calls[5][0]).toMatch(
        /Output Directory:/
      );
      expect((output.print as jest.Mock).mock.calls[6][0]).toMatch(
        /Framework:/
      );
      expect((output.print as jest.Mock).mock.calls[7][0]).toMatch(
        /Merging default project settings for framework Svelte. Previously listed overrides are prioritized./
      );
      expect((output.print as jest.Mock).mock.calls[8][0]).toMatch(
        /Auto-detected Project Settings/
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
      expect((output.print as jest.Mock).mock.calls.length).toBe(9);
      expect((output.print as jest.Mock).mock.calls[0][0]).toMatch(
        /Local settings detected in vercel.json:/
      );
      expect((output.print as jest.Mock).mock.calls[1][0]).toMatch(
        /Build Command:/
      );
      expect((output.print as jest.Mock).mock.calls[2][0]).toMatch(
        /Install Command:/
      );
      expect((output.print as jest.Mock).mock.calls[3][0]).toMatch(
        /Development Command:/
      );
      expect((output.print as jest.Mock).mock.calls[4][0]).toMatch(
        /Ignore Command:/
      );
      expect((output.print as jest.Mock).mock.calls[5][0]).toMatch(
        /Output Directory:/
      );
      expect((output.print as jest.Mock).mock.calls[6][0]).toMatch(
        /Framework:/
      );
      expect((output.print as jest.Mock).mock.calls[7][0]).toMatch(
        /Merging default project settings for framework Svelte. Previously listed overrides are prioritized./
      );
      expect((output.print as jest.Mock).mock.calls[8][0]).toMatch(
        /Auto-detected Project Settings/
      );
      const expectedResult: any = { ...overrides };
      delete expectedResult.ignoreCommand;
      expectedResult.commandForIgnoringBuildStep = overrides.ignoreCommand;
      expect(settings).toStrictEqual(expectedResult);
    });
  });
});
