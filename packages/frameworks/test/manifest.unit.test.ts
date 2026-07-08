import { join } from 'path';
import { existsSync } from 'fs';
import {
  createFrameworks,
  frameworksManifest,
  interpretFramework,
  UnsupportedFrameworkEntryError,
  type FrameworkManifestEntry,
} from '../src/frameworks';

function entry(
  overrides: Partial<FrameworkManifestEntry> & { slug: string }
): FrameworkManifestEntry {
  return {
    name: overrides.slug,
    logo: `https://api-frameworks.vercel.sh/framework-logos/${overrides.slug}.svg`,
    description: `The ${overrides.slug} framework`,
    settings: {
      installCommand: { placeholder: 'None' },
      buildCommand: { placeholder: 'None', value: null },
      devCommand: { placeholder: 'None', value: null },
      outputDirectory: { placeholder: 'None' },
    },
    outputDirName: { type: 'static', value: 'public' },
    ...overrides,
  } as FrameworkManifestEntry;
}

describe('pinned manifest', () => {
  it('exists (fetched by build.mjs, not checked into git)', () => {
    expect(existsSync(join(__dirname, '..', 'src', 'frameworks.json'))).toBe(
      true
    );
  });

  it('is a non-empty, fully interpretable framework list', () => {
    expect(frameworksManifest.length).toBeGreaterThan(0);
    const frameworks = createFrameworks({}, frameworksManifest);
    expect(frameworks.length).toBe(frameworksManifest.length);
  });
});

describe('interpretFramework', () => {
  it('interprets static outputDirName descriptors', async () => {
    const framework = interpretFramework(
      entry({ slug: 'a', outputDirName: { type: 'static', value: 'dist' } })
    );
    await expect(framework.getOutputDirName('unused')).resolves.toBe('dist');
  });

  it('throws UnsupportedFrameworkEntryError for unknown descriptors', () => {
    expect(() =>
      interpretFramework(
        entry({ slug: 'future', outputDirName: { type: 'from-the-future' } })
      )
    ).toThrow(UnsupportedFrameworkEntryError);
  });

  it('interprets array defaultRoutes as-is', () => {
    const routes = [{ handle: 'filesystem' as const }];
    const framework = interpretFramework(
      entry({ slug: 'a', defaultRoutes: routes })
    );
    expect(framework.defaultRoutes).toEqual(routes);
  });

  it('applies runtime overrides over manifest descriptors', async () => {
    const framework = interpretFramework(entry({ slug: 'special' }), {
      getOutputDirName: async () => 'overridden',
    });
    await expect(framework.getOutputDirName('unused')).resolves.toBe(
      'overridden'
    );
  });

  it('strips manifest-only fields', () => {
    const framework = interpretFramework(
      entry({ slug: 'a', minCliVersion: '1.0.0', failOnStale: true })
    );
    expect(framework).not.toHaveProperty('outputDirName');
    expect(framework).not.toHaveProperty('minCliVersion');
    expect(framework).not.toHaveProperty('failOnStale');
  });
});
