import { join } from 'path';
import { determineFrameworkVersion } from '../../../../src/commands/build';
import {
  Framework,
  frameworks,
} from '../../../../../frameworks/dist/frameworks';
import { Output } from '../../../../src/util/output/create-output';

const fixture = (name: string) =>
  join(__dirname, '../../../fixtures/unit/commands/build', name);

describe('build: determineFrameworkVersion', () => {
  it('should build return undefined if not versionDependencies', async () => {
    const cwd = fixture('minimal-nextjs');
    const output = new Output(process.stdout, { debug: true });

    const nextjsRecord =
      frameworks.find(framework => framework.slug === 'nextjs') || null;
    if (!nextjsRecord) {
      throw new Error(
        'nextjsRecord is not defined, expected framework record from frameworks list'
      );
    }

    const framework = await determineFrameworkVersion(
      nextjsRecord as Framework,
      cwd,
      output
    );
    if (!framework) {
      throw new Error(
        'framework is not defined, expected `{ version: string; }`'
      );
    }
    expect(framework.version).toEqual('13.0.4');
  });
});
