import { describe, expect, test } from 'vitest';
import type { Framework } from '@vercel/frameworks';
import { frameworks } from '@vercel/frameworks';
import { editProjectSettings } from '../../../../src/util/input/edit-project-settings';
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
      await expect(client.stderr).toOutput('Detected Next.js');
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
      await expect(client.stderr).toOutput('Detected Svelte');
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
      await expect(client.stderr).toOutput('Detected Svelte');
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
      await expect(client.stderr).toOutput('Detected Svelte');
    });
  });

  describe('with configFileName override', () => {
    test('should display vercel.toml when configFileName is vercel.toml', async () => {
      const overrides = {
        buildCommand: 'BUILD_COMMAND',
        framework: 'nextjs',
      };
      const settings = await editProjectSettings(
        client,
        null,
        nextJSFramework,
        true,
        overrides,
        'vercel.toml'
      );
      expect(settings.buildCommand).toBe('BUILD_COMMAND');
      await expect(client.stderr).toOutput(
        'Local settings detected in vercel.toml:'
      );
    });

    test('should display vercel.ts when configFileName is vercel.ts', async () => {
      const overrides = {
        buildCommand: 'BUILD_COMMAND',
        framework: 'nextjs',
      };
      const settings = await editProjectSettings(
        client,
        null,
        nextJSFramework,
        true,
        overrides,
        'vercel.ts'
      );
      expect(settings.buildCommand).toBe('BUILD_COMMAND');
      await expect(client.stderr).toOutput(
        'Local settings detected in vercel.ts:'
      );
    });
  });

  describe('customize prompt copy', () => {
    test('asks "Customize settings?" instead of "Want to modify these settings?"', async () => {
      const settingsPromise = editProjectSettings(
        client,
        null,
        nextJSFramework,
        false,
        null
      );

      // New prompt copy must appear in stderr.
      await expect(client.stderr).toOutput('Customize settings?');

      // Dismiss the prompt (default: No) so the function resolves.
      client.stdin.write('\r');

      const settings = await settingsPromise;
      expect(settings.framework).toBe('nextjs');
    });

    test('does not use the legacy "Want to modify these settings?" copy', async () => {
      const settingsPromise = editProjectSettings(
        client,
        null,
        nextJSFramework,
        false,
        null
      );

      await expect(client.stderr).not.toOutput(
        'Want to modify these settings?'
      );

      // Need to still resolve the promise so it doesn't hang the test.
      client.stdin.write('\r');
      await settingsPromise;
    });

    test('does not use the legacy "Customize defaults?" copy', async () => {
      const settingsPromise = editProjectSettings(
        client,
        null,
        nextJSFramework,
        false,
        null
      );

      await expect(client.stderr).not.toOutput('Customize defaults?');

      client.stdin.write('\r');
      await settingsPromise;
    });

    test('confirming the prompt opens the settings checkbox panel', async () => {
      const settingsPromise = editProjectSettings(
        client,
        null,
        nextJSFramework,
        false,
        null
      );

      await expect(client.stderr).toOutput('Customize settings?');
      // Answer "y" + Enter — proves the confirm returned `true`
      // because the next prompt (checkbox panel) must render.
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        'Which settings would you like to overwrite (select multiple)?'
      );

      // Submit checkbox panel with zero selections so the promise resolves.
      client.stdin.write('\r');

      const settings = await settingsPromise;
      expect(settings.framework).toBe('nextjs');
    });

    test('per-field prompt asks "<Setting>?" not "What\'s your <Setting>?"', async () => {
      const settingsPromise = editProjectSettings(
        client,
        null,
        nextJSFramework,
        false,
        null
      );

      await expect(client.stderr).toOutput('Customize settings?');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        'Which settings would you like to overwrite (select multiple)?'
      );

      // Toggle first option (Build Command — choices are sorted alphabetically)
      // then submit the checkbox panel.
      client.events.keypress('space');
      client.events.keypress('enter');

      // The new prompt is just "Build Command?" — no "What's your" preamble.
      await expect(client.stderr).toOutput('Build Command?');
      client.stdin.write('npm run build\n');

      const settings = await settingsPromise;
      expect(settings.buildCommand).toBe('npm run build');
      // Anti-regression: legacy preamble must not appear.
      expect(client.stderr.getFullOutput()).not.toContain(
        "What's your Build Command?"
      );
    });
  });

  describe('detected line formatting', () => {
    test('uses bold "Detected" verb without the gray "> " log prefix', async () => {
      await editProjectSettings(client, null, nextJSFramework, true, null);

      const fullOutput = client.stderr.getFullOutput();
      // output.log prepends gray "> " — output.print does not.
      // Detected line must use output.print so it visually matches the
      // bold-label block (Linked / Inspect / Production).
      expect(fullOutput).not.toMatch(/> Detected/);
      expect(fullOutput).toContain('Detected');
    });

    test('inline detail uses Title Case "Build Command" / "Output Directory"', async () => {
      await editProjectSettings(client, null, nextJSFramework, true, null);

      const fullOutput = client.stderr.getFullOutput();
      // Title Case matches the checkbox panel that follows.
      // Anti-regression: must NOT use the old lowercase "build:" / "output:".
      expect(fullOutput).toContain('Build Command:');
      expect(fullOutput).toContain('Output Directory:');
      expect(fullOutput).not.toMatch(/\(build:/);
      expect(fullOutput).not.toMatch(/, output:/);
    });

    test('does not apply blue color to framework name', async () => {
      await editProjectSettings(client, null, nextJSFramework, true, null);
      const fullOutput = client.stderr.getFullOutput();
      // The framework name should be bold but not blue (no chalk.blue ANSI code).
      // chalk.blue ANSI sequence is \x1b[34m. The Detected line must NOT contain it.
      const detectedLineMatch = fullOutput.match(/Detected[^\n]*/);
      expect(detectedLineMatch).toBeTruthy();
      expect(detectedLineMatch![0]).not.toContain('\x1b[34m');
    });

    test('does not emit 🔥 Hono emoji', async () => {
      const honoFramework = frameworks.find(
        fwk => fwk.name === 'Hono'
      ) as unknown as Framework;
      if (!honoFramework) return; // skip if Hono isn't in the framework list
      await editProjectSettings(client, null, honoFramework, true, null);
      const fullOutput = client.stderr.getFullOutput();
      expect(fullOutput).not.toContain('🔥');
    });
  });
});
