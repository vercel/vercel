import { projectSelector } from '../../../../src/util/input/project-selector';
import { MockClient } from '../../../mocks/client';
import { setupFixtureFromTemplate } from '../../../helpers/setup-fixture';
import path from 'path';
import { RepoProjectsConfig } from '../../../../src/util/link/repo';

describe('projectSelector', () => {
  const rootFixturePath = path.join('commands', 'link', 'monorepo');
  const expectedPaths = [
    '/apps/app-1',
    '/apps/app-2',
    '/packages/package-1',
    '/packages/package-2',
  ];
  const getExpectedPaths = (fixture: string) =>
    fixture === 'nested'
      ? expectedPaths.flatMap(p => [
          path.join('/backend', p),
          path.join('/frontend', p),
        ])
      : expectedPaths;

  describe.each(['nested', 'npm', 'yarn', 'pnpm', 'nx', 'rush'])(
    'fixture: %s',
    fixture => {
      let cwd: string;
      let client: MockClient;
      const expected = getExpectedPaths(fixture);

      beforeEach(() => {
        cwd = setupFixtureFromTemplate(
          path.join(rootFixturePath, fixture),
          path.join(rootFixturePath, '_template'),
          fixture === 'nested' ? ['backend', 'frontend'] : undefined
        );
        client = new MockClient();
      });

      describe('when repo.json is not present', () => {
        it('should return list of projects based on workspace list', async () => {
          const projectSelectorPromise = projectSelector(client, cwd);
          await expect(client.stderr).toOutput('Select projects');
          client.stdin.write('a\n');
          const actual = await projectSelectorPromise;
          expect(actual.sort()).toStrictEqual(expected?.sort());
        });

        it('should default to no projects selected', async () => {
          const projectSelectorPromise = projectSelector(client, cwd);
          await expect(client.stderr).toOutput('Select projects');
          client.stdin.write('\n');
          const actual = await projectSelectorPromise;
          expect(actual.sort()).toStrictEqual([]);
        });

        it('should return no projects when autoConfirm is enabled', async () => {
          const actual = await projectSelector(client, cwd, undefined, true);
          expect(actual.sort()).toStrictEqual([]);
        });
      });

      describe('when repo.json is present', () => {
        const repoJSON: RepoProjectsConfig = {
          orgId: '0',
          remoteName: '1',
          projects: expected.map((expectedPath, i) => ({
            id: i.toString(),
            name: expectedPath,
            directory: expectedPath,
          })),
        };

        it('should default and return list of projects defined in repo.json', async () => {
          const projectSelectorPromise = projectSelector(client, cwd, repoJSON);
          await expect(client.stderr).toOutput('Select projects');
          client.stdin.write('\n');
          const actual = await projectSelectorPromise;
          expect(actual.sort()).toStrictEqual(expected);
        });

        it('should return all projects defined in repo.json when autoConfirm is enabled', async () => {
          const actual = await projectSelector(client, cwd, repoJSON, true);
          expect(actual.sort()).toStrictEqual(expected);
        });
      });
    }
  );
});
