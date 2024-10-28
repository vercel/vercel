import { beforeAll } from 'vitest';
import output from './src/output-manager';

beforeAll(() => {
  output.initialize({
    supportsHyperlink: false,
    noColor: true,
  });
});
