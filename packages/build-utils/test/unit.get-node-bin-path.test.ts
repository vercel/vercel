import { join, parse } from 'path';
import { getNodeBinPath } from '../src';

describe('Test `getNodeBinPath()`', () => {
  it.skip('should work with npm7', async () => {
    const cwd = join(__dirname, 'fixtures', '20-npm-7');
    const result = await getNodeBinPath({ cwd });
    expect(result).toBe(join(cwd, 'node_modules', '.bin'));
  });

  it.skip('should work with yarn', async () => {
    const cwd = join(__dirname, 'fixtures', '19-yarn-v2');
    const result = await getNodeBinPath({ cwd });
    expect(result).toBe(join(cwd, 'node_modules', '.bin'));
  });

  it.skip('should work with npm 6', async () => {
    const cwd = join(__dirname, 'fixtures', '08-yarn-npm/with-npm');
    const result = await getNodeBinPath({ cwd });
    expect(result).toBe(join(cwd, 'node_modules', '.bin'));
  });

  it.skip('should work with npm workspaces', async () => {
    const cwd = join(__dirname, 'fixtures', '21-npm-workspaces/a');
    const result = await getNodeBinPath({ cwd });
    expect(result).toBe(join(cwd, '..', 'node_modules', '.bin'));
  });

  it.skip('should work with pnpm', async () => {
    const cwd = join(__dirname, 'fixtures', '22-pnpm');
    const result = await getNodeBinPath({ cwd });
    expect(result).toBe(join(cwd, 'node_modules', '.bin'));
  });

  it.skip('should work with pnpm workspaces', async () => {
    const cwd = join(__dirname, 'fixtures', '23-pnpm-workspaces/c');
    const result = await getNodeBinPath({ cwd });
    expect(result).toBe(join(cwd, '..', 'node_modules', '.bin'));
  });

  it.skip('should fallback to cwd if no lockfile found', async () => {
    const cwd = parse(process.cwd()).root;
    const result = await getNodeBinPath({ cwd });
    expect(result).toBe(join(cwd, 'node_modules', '.bin'));
  });
});
