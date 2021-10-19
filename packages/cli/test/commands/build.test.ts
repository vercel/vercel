import chance from 'chance';
import { BuildState, BuildStateSource } from '../../src/commands/build';
import { findFramework } from '../../src/util/projects/find-framework';
import { cleanupFixtures, setupFixture } from '../helpers/setup-fixture';
import { client } from '../mocks/client';

describe('build', () => {
  afterAll(() => {
    cleanupFixtures();
  });

  it('handles creating build state for framework defaults (nextjs)', async () => {
    const cwd = await setupFixture('vercel-pull-next');
    const buildState = new BuildState(cwd, client, {
      projectId: chance().guid(),
      orgId: chance().guid(),
      settings: {
        buildCommand: null,
        directoryListing: false,
        framework: 'nextjs',
        devCommand: null,
        rootDirectory: null,
        outputDirectory: null,
      },
    });

    expect(buildState.buildCommand?.value).toEqual(null);
    expect(buildState.buildCommand?.source).toEqual(BuildStateSource.DEFAULT);
    expect(buildState.rootDirectory?.value).toEqual(null);
    expect(buildState.rootDirectory?.source).toEqual(BuildStateSource.DEFAULT);
    expect(buildState.outputDirectory?.value).toEqual('.next');
    expect(buildState.outputDirectory?.source).toEqual(
      BuildStateSource.DEFAULT
    );
  });

  it('handles creating build state for framework defaults (gatsby)', async () => {
    const cwd = await setupFixture('vercel-build-gatsby');
    const buildState = new BuildState(cwd, client, {
      projectId: chance().guid(),
      orgId: chance().guid(),
      settings: {
        buildCommand: null,
        directoryListing: false,
        framework: 'gatsby',
        devCommand: null,
        rootDirectory: null,
        outputDirectory: null,
      },
    });

    expect(buildState.buildCommand?.value).toEqual(null);
    expect(buildState.buildCommand?.source).toEqual(BuildStateSource.DEFAULT);
    expect(buildState.rootDirectory?.value).toEqual(null);
    expect(buildState.rootDirectory?.source).toEqual(BuildStateSource.DEFAULT);
    const value = (
      findFramework('gatsby')?.settings?.outputDirectory as {
        value: string;
        placeholder: string;
      }
    ).value;
    expect(buildState.outputDirectory?.value).toEqual(value);
    expect(buildState.outputDirectory?.source).toEqual(
      BuildStateSource.DEFAULT
    );
  });

  it('handles creating build state with custom build command', async () => {
    const cwd = await setupFixture('vercel-pull-next');
    const buildCommand = 'echo foo && next build';
    const buildState = new BuildState(cwd, client, {
      projectId: chance().guid(),
      orgId: chance().guid(),
      settings: {
        buildCommand,
        directoryListing: false,
        framework: 'nextjs',
        devCommand: null,
        rootDirectory: null,
        outputDirectory: null,
      },
    });

    expect(buildState.buildCommand?.value).toEqual(buildCommand);
    expect(buildState.buildCommand?.source).toEqual(BuildStateSource.DASHBOARD);
    expect(buildState.rootDirectory?.value).toEqual(null);
    expect(buildState.rootDirectory?.source).toEqual(BuildStateSource.DEFAULT);
    expect(buildState.outputDirectory?.value).toEqual('.next');
    expect(buildState.outputDirectory?.source).toEqual(
      BuildStateSource.DEFAULT
    );
  });

  it('handles creating build state with custom build command', async () => {
    const cwd = await setupFixture('vercel-pull-next');
    const buildCommand = 'echo foo && next build';
    const buildState = new BuildState(cwd, client, {
      projectId: chance().guid(),
      orgId: chance().guid(),
      settings: {
        buildCommand,
        directoryListing: false,
        framework: 'nextjs',
        devCommand: null,
        rootDirectory: null,
        outputDirectory: null,
      },
    });

    buildState.renderConfig();

    expect(client.outputBuffer.includes(buildCommand)).toBeTruthy();
    expect(client.outputBuffer.includes('Detected Next.js')).toBeTruthy();
  });
});
