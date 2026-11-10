import { join } from 'path';
import { registerFixtureDevTests } from './e2e-fixture-utils';

const fixturesDir = join(
  __dirname,
  '../../../../internals/service-topology/test/fixtures/e2e'
);

describe('[vc dev] service topology e2e fixtures (2/2)', () => {
  registerFixtureDevTests(fixturesDir, 2);
});
