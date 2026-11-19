import os from 'os';
import path from 'path';
import { mkdtemp, mkdirp, remove, writeFile } from 'fs-extra';
import { build } from '../src';
import {
  findMisplacedOutput,
  formatMisplacedOutputHint,
} from '../src/misplaced-output';

vi.setConfig({ testTimeout: 2 * 60 * 1000 });

describe('build() with misplaced Build Output API output', () => {
  it('explains where the output was found and suggests Root Directory', async () => {
    // Reproduces the eve deployment failure: the project's framework preset
    // ("eve") expects `.output`, but the Build Command runs the framework
    // build in a subdirectory, so Build Output API output lands at
    // `agent-app/.vercel/output` where neither the Build Output check nor
    // the Output Directory validation looks.
    const workPath = path.join(
      __dirname,
      'build-fixtures',
      'misplaced-output-eve'
    );

    try {
      await expect(
        build({
          files: {},
          entrypoint: 'package.json',
          repoRootPath: workPath,
          workPath,
          config: {
            zeroConfig: true,
            framework: 'eve',
            buildCommand: 'node build.mjs',
          },
          meta: { skipDownload: true, cliVersion: '0.0.0' },
        })
      ).rejects.toThrow(
        new RegExp(
          `No Output Directory named "\\.output" found after the Build completed\\.` +
            ` Build output was found at "agent-app[\\\\/]\\.vercel[\\\\/]output" instead\\.` +
            ` If your application lives in "agent-app", set the project's Root Directory to "agent-app"`
        )
      );
    } finally {
      await remove(path.join(workPath, 'agent-app'));
    }
  });
});

describe('findMisplacedOutput()', () => {
  let workPath: string;

  beforeEach(async () => {
    workPath = await mkdtemp(path.join(os.tmpdir(), 'misplaced-output-'));
  });

  afterEach(async () => {
    await remove(workPath);
  });

  it('returns undefined when no output exists anywhere', async () => {
    await mkdirp(path.join(workPath, 'src'));
    expect(
      findMisplacedOutput(workPath, '.output', path.join(workPath, '.output'))
    ).toBeUndefined();
  });

  it('finds Build Output API output in a subdirectory', async () => {
    // The reproduced eve case: a root build script runs `eve build` inside
    // `agent-app`, so `.vercel/output` lands one level below where the
    // platform validates the (never-created on Vercel) `.output` directory.
    const outputDir = path.join(workPath, 'agent-app', '.vercel', 'output');
    await mkdirp(outputDir);
    await writeFile(path.join(outputDir, 'config.json'), '{"version":3}');

    const misplaced = findMisplacedOutput(
      workPath,
      '.output',
      path.join(workPath, '.output')
    );
    expect(misplaced).toEqual({
      outputPath: path.join('agent-app', '.vercel', 'output'),
      rootDirectory: 'agent-app',
    });
  });

  it('finds Build Output API output at the work path itself', async () => {
    const outputDir = path.join(workPath, '.vercel', 'output');
    await mkdirp(outputDir);
    await writeFile(path.join(outputDir, 'config.json'), '{"version":3}');

    const misplaced = findMisplacedOutput(
      workPath,
      '.output',
      path.join(workPath, 'sub', '.output')
    );
    expect(misplaced).toEqual({
      outputPath: path.join('.vercel', 'output'),
      rootDirectory: '',
    });
  });

  it('ignores a .vercel directory without Build Output config.json', async () => {
    await mkdirp(path.join(workPath, 'app', '.vercel', 'output'));
    expect(
      findMisplacedOutput(workPath, '.output', path.join(workPath, '.output'))
    ).toBeUndefined();
  });

  it('finds a directory matching the expected Output Directory name', async () => {
    await mkdirp(path.join(workPath, 'packages', 'site', 'dist'));

    const misplaced = findMisplacedOutput(
      workPath,
      'dist',
      path.join(workPath, 'dist')
    );
    expect(misplaced).toEqual({
      outputPath: path.join('packages', 'site', 'dist'),
      rootDirectory: path.join('packages', 'site'),
    });
  });

  it('does not report the expected dist dir itself as misplaced', async () => {
    // `distDir` is only validated after it was found missing, but guard
    // against races/symlinked paths reporting the expected location.
    expect(
      findMisplacedOutput(workPath, '.output', path.join(workPath, '.output'))
    ).toBeUndefined();
  });

  it('prefers Build Output API output over a dist dir name match', async () => {
    await mkdirp(path.join(workPath, 'a', '.output'));
    const outputDir = path.join(workPath, 'b', '.vercel', 'output');
    await mkdirp(outputDir);
    await writeFile(path.join(outputDir, 'config.json'), '{"version":3}');

    const misplaced = findMisplacedOutput(
      workPath,
      '.output',
      path.join(workPath, '.output')
    );
    expect(misplaced?.outputPath).toEqual(path.join('b', '.vercel', 'output'));
  });

  it('does not descend into node_modules', async () => {
    const outputDir = path.join(
      workPath,
      'node_modules',
      'some-pkg',
      '.vercel',
      'output'
    );
    await mkdirp(outputDir);
    await writeFile(path.join(outputDir, 'config.json'), '{"version":3}');

    expect(
      findMisplacedOutput(workPath, '.output', path.join(workPath, '.output'))
    ).toBeUndefined();
  });
});

describe('formatMisplacedOutputHint()', () => {
  it('suggests setting the Root Directory for subdirectory output', () => {
    const hint = formatMisplacedOutputHint({
      outputPath: path.join('agent-app', '.vercel', 'output'),
      rootDirectory: 'agent-app',
    });
    expect(hint).toContain('agent-app');
    expect(hint).toContain('Root Directory');
  });

  it('only reports the location when output is at the work path', () => {
    const hint = formatMisplacedOutputHint({
      outputPath: path.join('.vercel', 'output'),
      rootDirectory: '',
    });
    expect(hint).toContain(path.join('.vercel', 'output'));
    expect(hint).not.toContain('Root Directory');
  });
});
