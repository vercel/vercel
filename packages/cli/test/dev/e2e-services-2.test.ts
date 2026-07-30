import { join } from 'path';
import { registerFixtureDevTests } from './e2e-fixture-utils';

const fixturesDir = join(__dirname, '../../../fs-detectors/test/fixtures/e2e');

describe('[vc dev] fs-detectors e2e fixtures (2/3)', () => {
  registerFixtureDevTests(fixturesDir, 2);
});
