import { Framework, frameworks } from '@vercel/frameworks';
import editProjectSettings from '../../../../src/util/input/edit-project-settings';
import { client } from '../../../mocks/client';

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
        client,
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
      expect(client.mockOutput.mock.calls.length).toBe(5);
      expect(client.mockOutput.mock.calls[0][0]).toMatch(
        /No framework detected. Default Project Settings:/
      );
      expect(client.mockOutput.mock.calls[1][0]).toMatch(/Build Command/);
      expect(client.mockOutput.mock.calls[2][0]).toMatch(/Development Command/);
      expect(client.mockOutput.mock.calls[3][0]).toMatch(/Install Command/);
      expect(client.mockOutput.mock.calls[4][0]).toMatch(/Output Directory/);
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
        client,
        projectSettings,
        otherFramework,
        true,
        null
      );
      expect(settings).toStrictEqual({ ...projectSettings, framework: null });
      expect(client.mockOutput.mock.calls.length).toBe(5);
      expect(client.mockOutput.mock.calls[0][0]).toMatch(
        /No framework detected. Default Project Settings:/
      );
      expect(client.mockOutput.mock.calls[1][0]).toMatch(/Build Command/);
      expect(client.mockOutput.mock.calls[2][0]).toMatch(/Development Command/);
      expect(client.mockOutput.mock.calls[3][0]).toMatch(/Install Command/);
      expect(client.mockOutput.mock.calls[4][0]).toMatch(/Output Directory/);
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
        client,
        projectSettings,
        nextJSFramework,
        true,
        null
      );
      expect(client.mockOutput.mock.calls.length).toBe(5);
      expect(client.mockOutput.mock.calls[0][0]).toMatch(
        /Auto-detected Project Settings/
      );
      expect(client.mockOutput.mock.calls[1][0]).toMatch(/Build Command/);
      expect(client.mockOutput.mock.calls[2][0]).toMatch(/Development Command/);
      expect(client.mockOutput.mock.calls[3][0]).toMatch(/Install Command/);
      expect(client.mockOutput.mock.calls[4][0]).toMatch(/Output Directory/);
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
        commandForIgnoringBuildStep: 'IGNORE_COMMAND',
        installCommand: 'INSTALL_COMMAND',
        framework: 'svelte',
        outputDirectory: 'OUTPUT_DIRECTORY',
      };
      const settings = await editProjectSettings(
        client,
        projectSettings,
        nextJSFramework,
        true,
        overrides
      );
      expect(client.mockOutput.mock.calls.length).toBe(9);
      expect(client.mockOutput.mock.calls[0][0]).toMatch(
        /Local settings detected in vercel.json:/
      );
      expect(client.mockOutput.mock.calls[1][0]).toMatch(/Build Command:/);
      expect(client.mockOutput.mock.calls[2][0]).toMatch(/Ignore Command:/);
      expect(client.mockOutput.mock.calls[3][0]).toMatch(
        /Development Command:/
      );
      expect(client.mockOutput.mock.calls[4][0]).toMatch(/Framework:/);
      expect(client.mockOutput.mock.calls[5][0]).toMatch(/Install Command:/);
      expect(client.mockOutput.mock.calls[6][0]).toMatch(/Output Directory:/);
      expect(client.mockOutput.mock.calls[7][0]).toMatch(
        /Merging default Project Settings for Svelte. Previously listed overrides are prioritized./
      );
      expect(client.mockOutput.mock.calls[8][0]).toMatch(
        /Auto-detected Project Settings/
      );

      expect(settings).toStrictEqual(overrides);
    });
  });

  describe('with framework and overrides provided, but no settings', () => {
    test('overrides should be returned', async () => {
      const overrides = {
        buildCommand: 'BUILD_COMMAND',
        devCommand: 'DEV_COMMAND',
        commandForIgnoringBuildStep: 'IGNORE_COMMAND',
        installCommand: 'INSTALL_COMMAND',
        framework: 'svelte',
        outputDirectory: 'OUTPUT_DIRECTORY',
      };
      const settings = await editProjectSettings(
        client,
        null,
        nextJSFramework,
        true,
        overrides
      );
      expect(client.mockOutput.mock.calls.length).toBe(9);
      expect(client.mockOutput.mock.calls[0][0]).toMatch(
        /Local settings detected in vercel.json:/
      );
      expect(client.mockOutput.mock.calls[1][0]).toMatch(/Build Command:/);
      expect(client.mockOutput.mock.calls[2][0]).toMatch(/Ignore Command:/);
      expect(client.mockOutput.mock.calls[3][0]).toMatch(
        /Development Command:/
      );
      expect(client.mockOutput.mock.calls[4][0]).toMatch(/Framework:/);
      expect(client.mockOutput.mock.calls[5][0]).toMatch(/Install Command:/);
      expect(client.mockOutput.mock.calls[6][0]).toMatch(/Output Directory:/);
      expect(client.mockOutput.mock.calls[7][0]).toMatch(
        /Merging default Project Settings for Svelte. Previously listed overrides are prioritized./
      );
      expect(client.mockOutput.mock.calls[8][0]).toMatch(
        /Auto-detected Project Settings/
      );
      expect(settings).toStrictEqual(overrides);
    });
  });

  describe('with overrides provided, but no settings or framework', () => {
    test('overrides should be returned', async () => {
      const overrides = {
        buildCommand: 'BUILD_COMMAND',
        devCommand: 'DEV_COMMAND',
        commandForIgnoringBuildStep: 'IGNORE_COMMAND',
        installCommand: 'INSTALL_COMMAND',
        framework: 'svelte',
        outputDirectory: 'OUTPUT_DIRECTORY',
      };
      const settings = await editProjectSettings(
        client,
        null,
        null,
        true,
        overrides
      );
      expect(client.mockOutput.mock.calls.length).toBe(9);
      expect(client.mockOutput.mock.calls[0][0]).toMatch(
        /Local settings detected in vercel.json:/
      );
      expect(client.mockOutput.mock.calls[1][0]).toMatch(/Build Command:/);
      expect(client.mockOutput.mock.calls[2][0]).toMatch(/Ignore Command:/);
      expect(client.mockOutput.mock.calls[3][0]).toMatch(
        /Development Command:/
      );
      expect(client.mockOutput.mock.calls[4][0]).toMatch(/Framework:/);
      expect(client.mockOutput.mock.calls[5][0]).toMatch(/Install Command:/);
      expect(client.mockOutput.mock.calls[6][0]).toMatch(/Output Directory:/);
      expect(client.mockOutput.mock.calls[7][0]).toMatch(
        /Merging default Project Settings for Svelte. Previously listed overrides are prioritized./
      );
      expect(client.mockOutput.mock.calls[8][0]).toMatch(
        /Auto-detected Project Settings/
      );

      expect(settings).toStrictEqual(overrides);
    });
  });
});
