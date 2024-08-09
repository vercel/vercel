import frameworkList from '@vercel/frameworks';
import { detectFramework, LocalFileSystemDetector } from '../src';
import { getExamples } from '../../../examples/__tests__/test-utils';

const overrides = new Map([
  // Storybook isn't really a "framework".
  // In this example, it's really a Next.js app.
  ['storybook', 'nextjs'],
  // Hydrogen v2 uses Remix under the hood.
  ['hydrogen-2', 'remix'],
]);

describe('examples should be detected', () => {
  it.each(getExamples())(
    'should detect $exampleName',
    async ({ exampleName, examplePath }) => {
      const fs = new LocalFileSystemDetector(examplePath);
      const framework = await detectFramework({ fs, frameworkList });
      if (!framework) {
        throw new Error(`Framework not detected for example "${exampleName}".`);
      }

      expect(framework).toBe(overrides.get(framework) ?? framework);
    }
  );
});
