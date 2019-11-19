import assert from 'assert';
import { join } from 'path';
import { readFile, pathExists } from 'fs-extra';
import { detectDefaults, DetectorFilesystem } from '../src';
import { firstTruthy } from '../src/detectors';

class LocalFilesystem extends DetectorFilesystem {
  private dir: string;

  constructor(dir: string) {
    super();
    this.dir = dir;
  }

  _exists(name: string): Promise<boolean> {
    return pathExists(join(this.dir, name));
  }

  _readFile(name: string): Promise<Buffer> {
    return readFile(join(this.dir, name));
  }
}

test('firstTruthy() - truthy', async () => {
  const result = await firstTruthy([(async () => 0)(), (async () => 1)()]);
  assert.equal(result, 1);
});

test('firstTruthy() - falsy', async () => {
  const result = await firstTruthy([(async () => 0)(), (async () => 0)()]);
  assert.equal(result, 0);
});

test('firstTruthy() - one throws', async () => {
  const result = await firstTruthy([
    (async () => {
      throw new Error('bad');
    })(),
    (async () => 1)(),
  ]);
  assert.equal(result, 1);
});

test('firstTruthy() - all throws', async () => {
  let errors;
  try {
    await firstTruthy([
      (async () => {
        throw new Error('bad 1');
      })(),
      (async () => {
        throw new Error('bad 2');
      })(),
    ]);
  } catch (_err) {
    errors = _err;
  }
  assert(errors);
  assert.equal(errors.name, 'AggregateError');
  const arr = Array.from(errors) as Error[];
  assert.equal(arr[0].message, 'bad 1');
  assert.equal(arr[1].message, 'bad 2');
});

test('detectDefaults() - angular', async () => {
  const dir = join(__dirname, 'fixtures', '03-zero-config-angular');
  const fs = new LocalFilesystem(dir);
  const result = await detectDefaults({ fs });
  if (!result) throw new Error('Expected result');
  assert.equal(result.buildDirectory, 'dist');
  assert.deepEqual(result.buildCommand, ['ng', 'build']);
});

test('detectDefaults() - brunch', async () => {
  const dir = join(__dirname, 'fixtures', '04-zero-config-brunch');
  const fs = new LocalFilesystem(dir);
  const result = await detectDefaults({ fs });
  if (!result) throw new Error('Expected result');
  assert.equal(result.buildDirectory, 'public');
  assert.deepEqual(result.buildCommand, ['brunch', 'build', '--production']);
});

test('detectDefaults() - hugo', async () => {
  const dir = join(__dirname, 'fixtures', '06-zero-config-hugo');
  const fs = new LocalFilesystem(dir);
  const result = await detectDefaults({ fs });
  if (!result) throw new Error('Expected result');
  assert.equal(result.buildDirectory, 'public');
  assert.deepEqual(result.buildCommand, ['hugo']);
});

test('detectDefaults() - jekyll', async () => {
  const dir = join(__dirname, 'fixtures', '07-zero-config-jekyll');
  const fs = new LocalFilesystem(dir);
  const result = await detectDefaults({ fs });
  if (!result) throw new Error('Expected result');
  assert.equal(result.buildDirectory, '_site');
  assert.deepEqual(result.buildCommand, ['jekyll', 'build']);
});

test('detectDefaults() - middleman', async () => {
  const dir = join(__dirname, 'fixtures', '08-zero-config-middleman');
  const fs = new LocalFilesystem(dir);
  const result = await detectDefaults({ fs });
  if (!result) throw new Error('Expected result');
  assert.equal(result.buildDirectory, 'build');
  assert.deepEqual(result.buildCommand, [
    'bundle',
    'exec',
    'middleman',
    'build',
  ]);
});
