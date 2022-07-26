import ms from 'ms';
import { join } from 'path';
import { remove } from 'fs-extra';
import { getWriteableDirectory } from '@vercel/build-utils';
import { client } from '../../../mocks/client';
import {
  importBuilders,
  resolveBuilders,
} from '../../../../src/util/build/import-builders';
import vercelNextPkg from '@vercel/next/package.json';
import vercelNodePkg from '@vercel/node/package.json';

jest.setTimeout(ms('30 seconds'));

describe('importBuilders()', () => {
  it('should import built-in Builders', async () => {
    const specs = new Set(['@vercel/node', '@vercel/next']);
    const builders = await importBuilders(specs, process.cwd(), client.output);
    expect(builders.size).toEqual(2);
    expect(builders.get('@vercel/node')?.pkg).toMatchObject(vercelNodePkg);
    expect(builders.get('@vercel/next')?.pkg).toMatchObject(vercelNextPkg);
    expect(typeof builders.get('@vercel/node')?.builder.build).toEqual(
      'function'
    );
    expect(typeof builders.get('@vercel/next')?.builder.build).toEqual(
      'function'
    );
  });

  it('should import 3rd party Builders', async () => {
    const cwd = await getWriteableDirectory();
    try {
      const spec = 'vercel-deno@2.0.1';
      const specs = new Set([spec]);
      const builders = await importBuilders(specs, cwd, client.output);
      expect(builders.size).toEqual(1);
      expect(builders.get(spec)?.pkg.name).toEqual('vercel-deno');
      expect(builders.get(spec)?.pkg.version).toEqual('2.0.1');
      expect(builders.get(spec)?.pkgPath).toEqual(
        join(cwd, '.vercel/builders/node_modules/vercel-deno/package.json')
      );
      expect(typeof builders.get(spec)?.builder.build).toEqual('function');
    } finally {
      await remove(cwd);
    }
  });

  it('should import legacy `@now/build-utils` Builders', async () => {
    const cwd = await getWriteableDirectory();
    try {
      const spec = '@frontity/now@1.2.0';
      const specs = new Set([spec]);
      const builders = await importBuilders(specs, cwd, client.output);
      expect(builders.size).toEqual(1);
      expect(builders.get(spec)?.pkg.name).toEqual('@frontity/now');
      expect(builders.get(spec)?.pkg.version).toEqual('1.2.0');
      expect(builders.get(spec)?.pkgPath).toEqual(
        join(cwd, '.vercel/builders/node_modules/@frontity/now/package.json')
      );
      expect(typeof builders.get(spec)?.builder.build).toEqual('function');
    } finally {
      await remove(cwd);
    }
  });
});

describe('resolveBuilders()', () => {
  it('should return builders to install when missing', async () => {
    const specs = new Set(['@vercel/does-not-exist']);
    const result = await resolveBuilders(process.cwd(), specs, client.output);
    if (!('buildersToAdd' in result)) {
      throw new Error('Expected `buildersToAdd` to be defined');
    }
    expect([...result.buildersToAdd]).toEqual(['@vercel/does-not-exist']);
  });

  it('should throw error when `MODULE_NOT_FOUND` on 2nd pass', async () => {
    let err: Error | undefined;
    const specs = new Set(['@vercel/does-not-exist']);

    // The empty Map represents `resolveBuilders()` being invoked after the install step
    try {
      await resolveBuilders(process.cwd(), specs, client.output, new Map());
    } catch (_err: any) {
      err = _err;
    }

    if (!err) {
      throw new Error('Expected `err` to be defined');
    }

    expect(
      err.message.startsWith('Importing "@vercel/does-not-exist": Cannot')
    ).toEqual(true);
  });
});
