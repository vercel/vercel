import { projectSelector } from '../../../../src/util/input/project-selector';
import { MockClient } from '../../../mocks/client';
import { setupFixtureFromTemplate } from '../../../helpers/setup-fixture';
import path from 'path';

describe('projectSelector', () => {
  const rootFixturePath = path.join('commands', 'link', 'monorepo');
  const expectedPaths = [
    '/apps/app-1',
    '/apps/app-2',
    '/packages/package-1',
    '/packages/package-2',
  ];
  describe.each([
    [
      'nested',
      expectedPaths.flatMap(p => [
        path.join('/backend', p),
        path.join('/frontend', p),
      ]),
    ],
    ['npm', expectedPaths],
    ['yarn', expectedPaths],
    ['pnpm', expectedPaths],
    ['nx', expectedPaths],
  ])(
    'should return expected list of projects for fixture %s',
    (fixture, expectedPaths) => {
      it('when repo.json is not present', async () => {
        const cwd = setupFixtureFromTemplate(
          path.join(rootFixturePath, fixture),
          path.join(rootFixturePath, '_template'),
          fixture === 'nested' ? ['backend', 'frontend'] : undefined
        );
        const client = new MockClient();
        const projectSelectorPromise = projectSelector(client, cwd);
        await expect(client.stderr).toOutput('Select projects');
        client.stdin.write('a\n');
        const actual = await projectSelectorPromise;
        // const expected = expectedPaths.map(expectedPath => path.join(cwd, expectedPath))
        expect(actual.sort()).toStrictEqual(expectedPaths?.sort());
      });
    }
  );
});
