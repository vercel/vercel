import chance from 'chance';
import { BuildState, BuildStateSource } from '../../src/commands/build';
import { cleanupFixtures, setupFixture } from '../helpers/setup-fixture';
import { client } from '../mocks/client';

describe('build', () => {
  afterAll(() => {
    cleanupFixtures();
  });

  it('handles creating build state for framework defaults', async () => {
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
});
