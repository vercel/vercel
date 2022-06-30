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
      await expect(client.stderr).toOutput(
        'No framework detected. Default Project Settings:'
      );
      await expect(client.stderr).toOutput('Build Command');
      await expect(client.stderr).toOutput('Development Command');
      await expect(client.stderr).toOutput('Install Command');
      await expect(client.stderr).toOutput('Output Directory');
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
      await expect(client.stderr).toOutput(
        'No framework detected. Default Project Settings:'
      );
      await expect(client.stderr).toOutput('Build Command');
      await expect(client.stderr).toOutput('Development Command');
      await expect(client.stderr).toOutput('Install Command');
      await expect(client.stderr).toOutput('Output Directory');
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
      expect(settings).toStrictEqual({
        ...projectSettings,
        framework: nextJSFramework.slug,
      });
      await expect(client.stderr).toOutput('Auto-detected Project Settings');
      await expect(client.stderr).toOutput('Build Command');
      await expect(client.stderr).toOutput('Development Command');
      await expect(client.stderr).toOutput('Install Command');
      await expect(client.stderr).toOutput('Output Directory');
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
      expect(settings).toStrictEqual(overrides);
      await expect(client.stderr).toOutput(
        'Local settings detected in vercel.json:'
      );
      await expect(client.stderr).toOutput('Build Command:');
      await expect(client.stderr).toOutput('Ignore Command:');
      await expect(client.stderr).toOutput('Development Command:');
      await expect(client.stderr).toOutput('Framework:');
      await expect(client.stderr).toOutput('Install Command:');
      await expect(client.stderr).toOutput('Output Directory:');
      await expect(client.stderr).toOutput(
        'Merging default Project Settings for Svelte. Previously listed overrides are prioritized.'
      );
      await expect(client.stderr).toOutput('Auto-detected Project Settings');
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
      expect(settings).toStrictEqual(overrides);
      await expect(client.stderr).toOutput(
        'Local settings detected in vercel.json:'
      );
      await expect(client.stderr).toOutput('Build Command:');
      await expect(client.stderr).toOutput('Ignore Command:');
      await expect(client.stderr).toOutput('Development Command:');
      await expect(client.stderr).toOutput('Framework:');
      await expect(client.stderr).toOutput('Install Command:');
      await expect(client.stderr).toOutput('Output Directory:');
      await expect(client.stderr).toOutput(
        'Merging default Project Settings for Svelte. Previously listed overrides are prioritized.'
      );
      await expect(client.stderr).toOutput('Auto-detected Project Settings');
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
      expect(settings).toStrictEqual(overrides);
      await expect(client.stderr).toOutput(
        'Local settings detected in vercel.json:'
      );
      await expect(client.stderr).toOutput('Build Command:');
      await expect(client.stderr).toOutput('Ignore Command:');
      await expect(client.stderr).toOutput('Development Command:');
      await expect(client.stderr).toOutput('Framework:');
      await expect(client.stderr).toOutput('Install Command:');
      await expect(client.stderr).toOutput('Output Directory:');
      await expect(client.stderr).toOutput(
        'Merging default Project Settings for Svelte. Previously listed overrides are prioritized.'
      );
      await expect(client.stderr).toOutput('Auto-detected Project Settings');
    });
  });
});
